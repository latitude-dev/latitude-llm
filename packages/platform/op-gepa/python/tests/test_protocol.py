import asyncio

from op_gepa_engine.rpc.protocol import (
    RpcErrorCode,
    RpcRemoteError,
    _exception_message,
    _first_remote_message,
    create_exception_error,
)


def test_first_remote_message_reads_nested_cause() -> None:
    assert (
        _first_remote_message(
            {
                "httpMessage": 'Evaluation alignment activity "optimizeEvaluationDraft" failed',
                "cause": {"message": "Bedrock is unable to process your request."},
            }
        )
        == 'Evaluation alignment activity "optimizeEvaluationDraft" failed'
    )


def test_exception_message_falls_back_to_class_name_for_cancelled_error() -> None:
    assert _exception_message(asyncio.CancelledError()) == "CancelledError"


def test_create_exception_error_never_emits_empty_message() -> None:
    rpc_error = create_exception_error(RpcRemoteError(code=RpcErrorCode.INTERNAL_ERROR, message="", data={"type": "CancelledError"}))

    assert rpc_error.message == "CancelledError"
