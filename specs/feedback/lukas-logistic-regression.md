# Feedback: Logistic Regression Spec

| Field | Value |
|---|---|
| Reviewer | Lukas |
| Specs reviewed | [summary](../logistic-regression/summary.md), [implementation plan](../logistic-regression/implementation-plan.md), [test plan](../logistic-regression/test-plan.md) |
| Date | 2026-11-26 |

Overall the spec looks complete. Below are my main takeaways, then a few worries and questions.

## How I understand it

- Newton is the default. Each site sends its gradient and Hessian, and the coordinator adds
  them up, adds the L2 penalty once, and takes one step. Because it's just sums, the result is
  the same as training on all the data pooled together.
- FedAvg is the backup for when there are many features or we need more privacy. Sites train
  locally, and the coordinator averages their weights by row count.
- Round 0 never moves any rows. It only collects sums, which are used to standardize features,
  check that sites match, apply the site size rule, and catch unit mix-ups.

## Worries and questions

1. **Newton as default depends on round time, which we haven't measured.** Newton needs fewer
   rounds, but each round could be slower and its payload bigger. We should get a real number
   (LR-E3) before accepting decision 0002. Our Nov 17 DCP test might already have one. Alex
   thinks long-lived jobs are possible (A12), which would make every round faster for both methods.
2. **The site size rule gets strict quickly.** At 13 features a site needs 121 rows for Newton.
   At 30 features it needs about 530. Should the spec say when to switch to FedAvg, or should we
   switch automatically when a site is too small?
3. **Waiting for every site.** With the default `minParticipants` = all sites, one slow hospital
   holds up everyone. I agree that's right for v0.1 because it keeps Newton exact. But we should
   say how long a round can wait before it fails.
4. **A rejected Newton step costs a full round**, because we only learn the loss went up in the
   next round. I agree this is fine since L2 makes it rare. Just pointing out the trade-off.
5. **Class weights.** Using global class counts so every site has the same objective is a good
   call. But a balanced model's probabilities aren't real risk numbers, so the demo and docs
   should say so.
6. **Spec and code don't match in a few small places.** A bad site result stops the whole run
   instead of being retried, and `participation` is stored in a different format than the spec
   says. Which one should we change, the spec or the code?
7. **FedAvg, checkpoints and resume aren't built yet**, but the release plan puts them in v0.1.
   Is that still the plan, or can they move to v0.2?
8. **Showcase wording.** v0.1 sends the data inside the job (decision 0001), but the demo keeps
   the data on each laptop (decision 0004). We should be clear about which one we're showing.
9. **Owners are all TODO.** I'm happy to take one part, for example FedAvg or checkpoints.

## Questions for Sunday's meeting with Distributive

- Is there a size limit on what a worker can send back? The Newton Hessian grows with the square
  of the number of features: about 120 numbers at 13 features, but about 43,000 at 292.
- Can we send a task to one specific laptop without a separate compute group for each laptop?
  (A2, still open)
