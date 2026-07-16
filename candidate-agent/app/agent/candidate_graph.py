from __future__ import annotations

import logging

from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph

from app.agent.candidate_state import CandidateState
from app.agent.model_factory import ModelFactory
from app.agent.nodes.advance_round_node import AdvanceRoundNode
from app.agent.nodes.candidate_node import CandidateNode
from app.agent.nodes.publish_node import PublishNode
from app.services.experiment_manager import ExperimentManager


class CandidateGraph:
    """Builds the LangGraph state machine that drives one candidate debate.

    Flow::

        START -> candidate_1 -> candidate_2 -> [round < event.rounds?]
                    ^                              |            |
                    |                             yes           no
                    |                              |            v
                    +------------ advance_round <---+         publish -> END

    Each round runs candidate_1 then candidate_2 in sequence. After both have
    replied, _route_after_candidates decides whether to loop back for another
    round (via advance_round, which increments state["round"]) or to publish
    the final transcript and end the graph.
    """

    def __init__(
        self,
        manager: ExperimentManager,
        logger: logging.Logger,
        model_factory: ModelFactory,
        advance_round_node: AdvanceRoundNode,
        publish_node: PublishNode,
    ):
        self._manager = manager
        self._logger = logger
        self._model_factory = model_factory
        self._advance_round_node = advance_round_node
        self._publish_node = publish_node

    def build(self) -> CompiledStateGraph:
        graph = StateGraph(CandidateState)
        graph.add_node(
            "candidate_1", CandidateNode(1, self._manager, self._logger, self._model_factory)
        )
        graph.add_node(
            "candidate_2", CandidateNode(2, self._manager, self._logger, self._model_factory)
        )
        graph.add_node("advance_round", self._advance_round_node)
        graph.add_node("publish", self._publish_node)
        graph.add_edge(START, "candidate_1")
        graph.add_edge("candidate_1", "candidate_2")
        graph.add_conditional_edges(
            "candidate_2",
            self._route_after_candidates,
            {"advance_round": "advance_round", "publish": "publish"},
        )
        graph.add_edge("advance_round", "candidate_1")
        graph.add_edge("publish", END)
        return graph.compile()

    @staticmethod
    def _route_after_candidates(state: CandidateState) -> str:
        return "advance_round" if state["round"] < state["event"].rounds else "publish"
