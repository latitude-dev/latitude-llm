import asyncio
from functools import partial
from typing import Any, Mapping, Sequence

from gepa.api import optimize  # pyright: ignore[reportUnknownVariableType]
from gepa.core.adapter import EvaluationBatch, GEPAAdapter
from gepa.core.result import GEPAResult
from gepa.core.state import GEPAState
from gepa.utils.stop_condition import CompositeStopper, NoImprovementStopper, StopperProtocol, TimeoutStopCondition

from op_gepa_engine.core.shared import (
    ENGINE_DEFAULT_REFLECTION_MINIBATCH_SIZE,
    ENGINE_MAX_STAGNATION,
    ENGINE_MAX_TIME,
    ENGINE_MAX_TOKENS,
    Budget,
)
from op_gepa_engine.env import env
from op_gepa_engine.rpc.server import RpcServer
from op_gepa_engine.util import Model, StrEnum

type Component = str
type Script = str # <script hash>
type System = dict[Component, Script]


class Example(Model):
    id: str


class Trajectory(Model):
    id: str


class Output(Model):
    id: str
    score: float
    expectedPositive: bool
    predictedPositive: bool
    totalTokens: int


class GepaMethod(StrEnum):
    OPTIMIZE = "gepa_optimize"
    EVALUATE = "gepa_evaluate"
    PROPOSE = "gepa_propose"


class GepaOptimizeParams(Model):
    baseline: System
    trainset: list[Example]
    valset: list[Example]
    budget: Budget
    reflectionSize: int | None


class GepaStopReason(StrEnum):
    TIME = "time"
    TOKENS = "tokens"
    STAGNATION = "stagnation"
    COMPLETED = "completed"


class GepaOptimizeResult(Model):
    optimized: System
    stopReason: GepaStopReason
    # Total main-loop iterations the engine entered. Includes iterations
    # skipped before reaching propose_new_texts (e.g. all-perfect subsamples,
    # merge-only iterations) — useful for diagnosing premature stagnation
    # when the visible propose count is small.
    totalIterations: int
    # Number of accepted candidates added to the pool, derived from
    # `result.num_candidates - 1` (subtract the seed). Together with
    # `totalIterations` this lets the caller see how many iterations were
    # silently skipped without ever calling our propose adapter.
    proposeCalls: int


class GepaEvaluateParams(Model):
    candidate: System
    example: Example


GepaEvaluateResult = Output


class GepaProposeParams(Model):
    component: Component
    script: Script
    context: list[Trajectory]


class GepaProposeResult(Model):
    script: Script


async def handle_gepa_optimize(server: RpcServer, params: GepaOptimizeParams) -> GepaOptimizeResult:
    loop = asyncio.get_running_loop()

    # TODO: Stoppers are checked only after a full iteration, we should stop the algorithm early on!
    #
    # Budget values come straight from the caller. ENGINE_MAX_* constants
    # are FALLBACKS for when the field is absent (or 0/falsy), not ceilings —
    # the caller (TS gepa-optimizer.ts) already supplies its own defaults via
    # `?? GEPA_MAX_*`, and Zod validates positive integers, so a double-clamp
    # here just silently overrides explicit caller intent (e.g. a higher
    # `--budget-stagnation`).
    timeout_stopper = TrackingStopper(
        GepaStopReason.TIME,
        TimeoutStopCondition(timeout_seconds=params.budget.time or ENGINE_MAX_TIME),
    )
    usage_inner = UsageStopCondition(max_usage=params.budget.tokens or ENGINE_MAX_TOKENS)
    usage_stopper = TrackingStopper(GepaStopReason.TOKENS, usage_inner)
    stagnation_stopper = TrackingStopper(
        GepaStopReason.STAGNATION,
        NoImprovementStopper(
            max_iterations_without_improvement=params.budget.stagnation or ENGINE_MAX_STAGNATION,
        ),
    )
    # Counts every main-loop iteration the engine enters. Always returns
    # False so it never stops the run; placed at the end of CompositeStopper
    # so it still gets called every loop top (any() short-circuits on the
    # first True, but our real stoppers are checked first and only one of
    # them ever returns True). Caller subtracts proposeCalls from this to
    # see how many iterations were silently skipped (gepa's
    # skip_perfect_score path, merge-only iterations, etc.).
    iteration_counter = IterationCounter()

    run_optimize = partial[GEPAResult[Output, str]](
        optimize,
        seed=env.LAT_GEPA_SEED,
        adapter=LatitudeAdapter(server, usage_inner),
        stop_callbacks=CompositeStopper(
            timeout_stopper, usage_stopper, stagnation_stopper, iteration_counter, mode="any"
        ),
        seed_candidate=params.baseline,
        trainset=params.trainset,
        valset=params.valset,
        candidate_selection_strategy="pareto",
        frontier_type="instance",
        batch_sampler="epoch_shuffled",
        reflection_minibatch_size=params.reflectionSize or ENGINE_DEFAULT_REFLECTION_MINIBATCH_SIZE,
        module_selector="round_robin",
        use_merge=True,
        max_merge_invocations=5,
        merge_val_overlap_floor=5,
        val_evaluation_policy="full_eval",
        task_lm=None,
        evaluator=None,
        reflection_lm=None,
        max_metric_calls=None,
        logger=None,
        run_dir=None,
        track_best_outputs=False,
        display_progress_bar=False,
        use_cloudpickle=False,
        raise_on_exception=True,
    )

    result = await loop.run_in_executor(None, run_optimize)

    # CompositeStopper(mode="any") short-circuits on the first stopper that
    # returns True, so at most one wrapped stopper records `triggered=True`.
    # Order matches the composite's argument order; if none triggered the run
    # exhausted its candidate pool and we report it as completed.
    stop_reason = next(
        (s.reason for s in (timeout_stopper, usage_stopper, stagnation_stopper) if s.triggered),
        GepaStopReason.COMPLETED,
    )

    return GepaOptimizeResult(
        optimized=result.best_candidate,
        stopReason=stop_reason,
        totalIterations=iteration_counter.iterations,
        # Subtract the seed candidate; remaining entries in the pool are
        # the ones GEPA actually accepted from a propose_new_texts call.
        proposeCalls=max(0, len(result.candidates) - 1),
    )


def register_gepa_handlers(server: RpcServer) -> None:
    server.register(GepaMethod.OPTIMIZE, handle_gepa_optimize, GepaOptimizeParams)


class UsageStopCondition(StopperProtocol):
    max_usage: int
    cur_usage: int

    def __init__(self, max_usage: int):
        self.max_usage = max_usage
        self.cur_usage = 0

    def increment(self, tokens: int) -> None:
        self.cur_usage += tokens

    def __call__(self, gepa_state: GEPAState[Output, str]) -> bool:
        return self.cur_usage >= self.max_usage


class TrackingStopper(StopperProtocol):
    """Wraps a stopper and records whether it has fired so callers can identify
    which condition ended the run. Relies on `CompositeStopper(mode="any")`
    short-circuiting — only the first triggered stopper sets `triggered=True`."""

    reason: GepaStopReason
    inner: StopperProtocol
    triggered: bool

    def __init__(self, reason: GepaStopReason, inner: StopperProtocol):
        self.reason = reason
        self.inner = inner
        self.triggered = False

    def __call__(self, gepa_state: GEPAState[Output, str]) -> bool:
        if self.inner(gepa_state):
            self.triggered = True
            return True
        return False


class IterationCounter(StopperProtocol):
    """Counts main-loop iterations without ever stopping the run.

    Plugged into the `CompositeStopper` so it gets invoked at every loop
    top alongside the real stoppers. Always returns False so the run is
    only ended by the time / tokens / stagnation stoppers; the count
    reflects every iteration the engine actually entered, including ones
    skipped before propose_new_texts (gepa's `skip_perfect_score` path,
    merge-only iterations). Subtract the accepted-candidate count from
    this on the caller side to see silent-skip iterations.
    """

    iterations: int

    def __init__(self):
        self.iterations = 0

    def __call__(self, gepa_state: GEPAState[Output, str]) -> bool:
        self.iterations += 1
        return False


class LatitudeAdapter(GEPAAdapter[Example, Trajectory, Output]):
    server: RpcServer
    usage: UsageStopCondition

    def __init__(self, server: RpcServer, usage: UsageStopCondition):
        self.server = server
        self.usage = usage

    def evaluate(
        self,
        batch: list[Example],
        candidate: System,
        capture_traces: bool = False,
    ) -> EvaluationBatch[Trajectory, Output]:
        self.server.raise_for_aborted()

        outputs = self.server.batch(
            GepaMethod.EVALUATE,
            [GepaEvaluateParams(candidate=candidate, example=example) for example in batch],
            GepaEvaluateResult,
            batch_size=10,
        )

        scores: list[float] = []
        trajectories: list[Trajectory] = []
        for output in outputs:
            scores.append(output.score)
            trajectories.append(Trajectory(id=output.id))
            self.usage.increment(output.totalTokens)

        return EvaluationBatch[Trajectory, Output](
            outputs=outputs,
            scores=scores,
            trajectories=trajectories if capture_traces else None,
            objective_scores=None,
        )

    def make_reflective_dataset(
        self,
        candidate: System,
        eval_batch: EvaluationBatch[Trajectory, Output],
        components_to_update: list[Component],
    ) -> Mapping[Component, Sequence[Mapping[str, Any]]]:
        self.server.raise_for_aborted()

        dataset: dict[Component, list[dict[str, Any]]] = {}
        for component in components_to_update:
            dataset[component] = [trajectory.model_dump() for trajectory in eval_batch.trajectories or []]

        return dataset

    def propose_new_texts(  # pyright: ignore[reportIncompatibleVariableOverride]
        self,
        candidate: System,
        reflective_dataset: Mapping[Component, Sequence[Mapping[str, Any]]],
        components_to_update: list[Component],
    ) -> System:
        self.server.raise_for_aborted()

        dataset: dict[Component, list[Trajectory]] = {}
        for component, rows in reflective_dataset.items():
            dataset[component] = [Trajectory(**row) for row in rows]

        results = self.server.batch(
            GepaMethod.PROPOSE,
            [
                GepaProposeParams(
                    component=component,
                    script=candidate[component],
                    context=dataset[component],
                )
                for component in components_to_update
            ],
            GepaProposeResult,
            batch_size=10,
        )

        proposed: System = {}
        for component, result in zip(components_to_update, results, strict=True):
            proposed[component] = result.script

        return proposed
