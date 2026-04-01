"""
Attribute keys for trace-wide context set via capture().
Propagated to all spans within the trace by the BaggageSpanProcessor.
"""


class ATTRIBUTES:
    tags = "latitude.tags"
    metadata = "latitude.metadata"
    session_id = "session.id"
    user_id = "user.id"
