import { assertDispatchAuthorized } from './dispatch-gate.mjs';
/**
 * Deterministic assignment mutation boundary (WP7).
 *
 * The agent never calls this module. It owns the last eligibility check and
 * the canonical state write that makes an assignment claim true.
 */
import { moveResponderToIssue } from "./responder-location.mjs";

function findIssue(state, issueId) {
  return state.issues.find((issue) => issue.id === issueId);
}

function findResponder(state, responderId) {
  return state.responders.find((responder) => responder.id === responderId);
}

export function assignResponder(state, issueId, responderId) {
  const issue = findIssue(state, issueId);
  if (!issue) return { status: "invalid", reason: "issue-not-found" };
  const responder = findResponder(state, responderId);
  if (!responder) return { status: "invalid", reason: "responder-not-found" };
  if (issue.status === "ASSIGNED" || issue.status === "RESOLVED") {
    return { status: "invalid", reason: "issue-not-assignable" };
  }
  if (responder.availability !== "AVAILABLE") {
    return { status: "stale", reason: "responder-not-available", responderId };
  }

  if (!assertDispatchAuthorized(state, issue, responderId, "INITIAL_ASSIGNMENT")) return { status: "gated", reason: "investigation-approval-required" };
  issue.status = "ASSIGNED";
  issue.assignedResponderId = responder.id;
  responder.availability = "ASSIGNED";
  responder.currentIssueId = issue.id;
  moveResponderToIssue(state, responder, issue);
  return { status: "assigned", issueId: issue.id, responderId: responder.id };
}
