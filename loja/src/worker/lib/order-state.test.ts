import { describe, expect, it } from "vitest";
import { isValidTransition } from "./orders";
import { ORDER_STATUSES } from "@shared/types";

/**
 * The transition table is the backbone of the system: it is what makes a double
 * delivery, or an expired order "returning" to paid, impossible by
 * construction. These tests pin every edge of it.
 */
describe("order state machine", () => {
  it("follows the happy path: awaiting -> paid -> delivered", () => {
    expect(isValidTransition("awaiting_payment", "paid")).toBe(true);
    expect(isValidTransition("paid", "delivered")).toBe(true);
  });

  it("refuses to deliver the same order twice", () => {
    expect(isValidTransition("delivered", "delivered")).toBe(false);
  });

  it("refuses to move a delivered order back to paid", () => {
    expect(isValidTransition("delivered", "paid")).toBe(false);
  });

  it("refuses to pay an order that already expired or was cancelled", () => {
    expect(isValidTransition("expired", "paid")).toBe(false);
    expect(isValidTransition("cancelled", "paid")).toBe(false);
  });

  it("allows refunding both a paid and a delivered order", () => {
    expect(isValidTransition("paid", "refunded")).toBe(true);
    expect(isValidTransition("delivered", "refunded")).toBe(true);
  });

  it("lets a closed order move to review, and nowhere else", () => {
    // A Pix can land on an order that is expired, cancelled or already
    // refunded: closing our row does not cancel the charge at the gateway, and
    // the buyer may still have the QR open. Without this one exit the payment
    // would be absorbed silently and not even an admin could fix it.
    for (const from of ["expired", "cancelled", "refunded"] as const) {
      expect(isValidTransition(from, "needs_review")).toBe(true);
      for (const target of ORDER_STATUSES) {
        if (target === "needs_review") continue;
        expect(isValidTransition(from, target)).toBe(false);
      }
    }
  });

  it("resolves a review by releasing or closing the order", () => {
    expect(isValidTransition("needs_review", "paid")).toBe(true);
    expect(isValidTransition("needs_review", "cancelled")).toBe(true);
    expect(isValidTransition("needs_review", "refunded")).toBe(true);
    // Never straight to delivered: review exists so a human checks first.
    expect(isValidTransition("needs_review", "delivered")).toBe(false);
  });

  it("never lets a status transition to itself", () => {
    for (const status of ORDER_STATUSES) {
      expect(isValidTransition(status, status)).toBe(false);
    }
  });

  it("keeps awaiting_payment as the only entry point into paid", () => {
    const canReachPaid = ORDER_STATUSES.filter((from) => isValidTransition(from, "paid"));
    expect(canReachPaid.sort()).toEqual(["awaiting_payment", "needs_review"]);
  });
});
