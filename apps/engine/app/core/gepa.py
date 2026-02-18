import asyncio
from functools import partial
from typing import Any, Mapping, Sequence

from gepa.api import optimize  # pyright: ignore[reportUnknownVariableType]
from gepa.core.adapter import EvaluationBatch, GEPAAdapter
from gepa.core.result import GEPAResult
from gepa.core.state import GEPAState
from gepa.utils.stop_condition import CompositeStopper, NoImprovementStopper, StopperProtocol, TimeoutStopCondition

from app.core.shared import ENGINE_MAX_STAGNATION, ENGINE_MAX_TIME, ENGINE_MAX_TOKENS, Budget, Usage
from app.env import env
from app.rpc.server import RpcServer
from app.util import Model, StrEnum

type Component = str  # <doc_path>
type Prompt = str  # <prompt_hash>
type System = dict[Component, Prompt]  # { <doc_path>: <prompt_hash> }


class Example(Model):
    id: str  # <workspace_id>::<dataset_id>::<row_id>


class Trajectory(Model):
    id: str  # <workspace_id>::<dataset_id>::<row_id>


class Output(Model):
    class Usage(Model):
        conversation: Usage
        evaluation: Usage

    id: str  # <workspace_id>::<dataset_id>::<row_id>
    usage: Usage
    duration: int
    score: float  # Normalized score [0,1]


class GepaMethod(StrEnum):
    OPTIMIZE = "gepa_optimize"
    EVALUATE = "gepa_evaluate"
    PROPOSE = "gepa_propose"


class GepaOptimizeParams(Model):
    baseline: System
    trainset: list[Example]
    valset: list[Example]
    budget: Budget


class GepaOptimizeResult(Model):
    optimized: System


class GepaEvaluateParams(Model):
    candidate: System
    example: Example


GepaEvaluateResult = Output


class GepaProposeParams(Model):
    component: Component
    prompt: Prompt
    context: list[Trajectory]


class GepaProposeResult(Model):
    prompt: Prompt


async def handle_gepa_optimize(server: RpcServer, params: GepaOptimizeParams) -> GepaOptimizeResult:
    loop = asyncio.get_running_loop()

    # BONUS(AO/OPT): Stoppers are checked only after a full iteration, we need to stop the algorithm early on!
    timeout_stopper = TimeoutStopCondition(timeout_seconds=min(params.budget.time or ENGINE_MAX_TIME, ENGINE_MAX_TIME))
    usage_stopper = UsageStopCondition(max_usage=min(params.budget.tokens or ENGINE_MAX_TOKENS, ENGINE_MAX_TOKENS))
    stagnation_stopper = NoImprovementStopper(max_iterations_without_improvement=ENGINE_MAX_STAGNATION)

    run_optimize = partial[GEPAResult[Output, str]](
        optimize,
        seed=env.ENGINE_SEED,
        adapter=LatitudeAdapter(server, usage_stopper),
        stop_callbacks=CompositeStopper(timeout_stopper, usage_stopper, stagnation_stopper, mode="any"),
        seed_candidate=params.baseline,
        trainset=params.trainset,
        valset=params.valset,
        candidate_selection_strategy="pareto",
        frontier_type="instance",  # BONUS(AO/OPT): Use "hybrid" for multi-objective optimization
        batch_sampler="epoch_shuffled",
        reflection_minibatch_size=5,
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

    return GepaOptimizeResult(optimized=result.best_candidate)


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

        outputs = self.server.sbatch(
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
            self.usage.increment(output.usage.conversation.total + output.usage.evaluation.total)

        return EvaluationBatch[Trajectory, Output](
            outputs=outputs,
            scores=scores,
            trajectories=trajectories if capture_traces else None,
            objective_scores=None,  # BONUS(AO/OPT): Implement multi-objective optimization
        )

    def make_reflective_dataset(
        self,
        candidate: System,
        eval_batch: EvaluationBatch[Trajectory, Output],
        components_to_update: list[Component],
    ) -> Mapping[Component, Sequence[Mapping[str, Any]]]:
        self.server.raise_for_aborted()

        # BONUS(AO/OPT): To support multi-document optimization we need to use the specific component's own trajectories
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

        results = self.server.sbatch(
            GepaMethod.PROPOSE,
            [
                GepaProposeParams(
                    component=component,
                    prompt=candidate[component],
                    context=dataset[component],
                )
                for component in components_to_update
            ],
            GepaProposeResult,
            batch_size=10,
        )

        proposed: System = {}
        for component, result in zip(components_to_update, results, strict=True):
            proposed[component] = result.prompt

        return proposed
