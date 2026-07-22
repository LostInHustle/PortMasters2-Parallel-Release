# Patch 01: post content pass defect report and remediation proposal

Status: All eight applied and verified. Two further defects were found while fixing and are recorded in section 9.
Scope: Eight reported defects following the difficulty and content tier work, each traced to its root implementation with a long term remedy rather than a local patch.

---

## 0. Summary and triage

| #   | Defect                                | Severity            | Root cause in one line                                                                                                                             |
| --- | ------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Charter goods do not enter the hold   | **P0, silent loss** | `inventory` is seeded with only the founding seven keys, and the purchase path is the one unguarded `+=` in the engine, so the value becomes `NaN` |
| 5   | Dialogs cannot be closed on tablets   | **P1, blocking**    | `DialogContent` has no height limit and no scroll, so a tall modal pushes its close button off screen                                              |
| 6   | Quantity fields cannot be edited      | **P1, blocking**    | All four numeric inputs parse and clamp on every keystroke, so the field can never be emptied                                                      |
| 3   | Locked goods listed everywhere        | P2                  | Three surfaces still iterate the full `RESOURCES` / `PRODUCTS` constants instead of the unlocked pools                                             |
| 4   | Artisan proficiency invisible         | P2                  | `Worker.isSkilled` drives production but is never surfaced; the roster rows are also still hardcoded to three types                                |
| 2   | Mandate is not a gold card, not first | P3                  | Mandate is appended last and styled violet                                                                                                         |
| 7   | Left rail too long, log buried        | P3                  | The rail stacks two panels with no height budget and no independent scroll                                                                         |

Defect 1 is the only one that destroys player state, so it leads. Defects 5 and 6 block ordinary play. The rest are correctness and polish.

---

## 1. Charter goods never reach the Cargo Hold (P0)

**Reported.** Buying Porcelain Clay or Copper Ore does not raise the hold count. Suspected to affect the other new goods too. It does, all eight of them.

**Root cause.** Two facts combine.

First, `createInitialGameState` seeds the hold with an object literal naming only the founding seven items (`src/lib/game/types.ts`, the `inventory:` block):

```ts
inventory: { Hemp: 8, Silk: 5, Tea: 3, "Linen Clothes": 0, "Cotton Clothes": 0, Brocade: 0, Sachet: 0 },
```

Nothing added a key for the charter goods, because that literal predates content tiers.

Second, `purchaseCard` contains the single unguarded inventory write in the whole engine (`src/lib/game/engine.ts`):

```ts
for (const r of card.resources) state.inventory[r.type] += r.quantity!;
```

For a key that does not exist yet this evaluates `undefined + 2`, which is `NaN`, and then **stores** `NaN`. Gold has already been deducted a few lines above.

**Why it looks like nothing happened.** Every reader defends itself with `inventory[x] || 0`, and `NaN || 0` is `0`. So the hold renders zero, the barter panel offers zero, and the order checks see zero. The purchase is not merely unshown, it is destroyed, and the `NaN` is then written into the saved blob where it persists for the rest of the voyage.

**Why only this site.** Every other write is already safe. `addOwnedAmount` uses `(state.inventory[item] || 0) + delta`; `processProduction` uses the same form; the consuming writes in `completeOrder` and `assignTask` are preceded by `(inventory[x] || 0) < n` guards that return early. `purchaseCard` is the lone exception.

**Long term remedy, three parts.** A one line `|| 0` at the call site would fix the symptom and leave the class of bug alive, so:

1. **Seed the hold from the item catalogue, not a literal.** Build the initial inventory by iterating every tradable item across all tiers, so a key always exists and any future tier is covered automatically. This removes the coupling between "content exists" and "state was hand written".
2. **Collapse to one mutation path.** Route the purchase write through the existing `addOwnedAmount` helper so the engine has exactly one inventory mutator, defensive by construction. Any future feature that moves goods inherits the safety.
3. **Self heal poisoned saves.** Add a load time sanitizer next to the existing back compat block in `use-game-session.ts` that coerces any non finite inventory value to `0`. Without this, every save already damaged by this bug stays broken forever, since `NaN` survives `JSON.stringify` as `null` and reloads as a bad value.

**Verification.** Buy one card of every tier 1 and tier 2 good and assert the hold rises by the exact quantity; assert no inventory value is ever non finite after a purchase; load a save deliberately poisoned with `NaN` and assert it reads back as `0`.

---

## 2. Emperor Mandate should be a gold card, first on the board (P3)

**Root cause.** The mandate is appended after the base draw and after the intel guarantee loop (`startPhase2` in `engine.ts`), so it lands in the final slot. The trade board styles `isMandate` violet (`GamePhasePanel.tsx`).

**Long term remedy.** Order the board by intent rather than by insertion accident. The mandate is inserted at index 0 after the guarantee loop has finished, so it always reads first regardless of how wide the market has grown, and the guarantee loop (which writes by index) cannot overwrite it. Card identity stays keyed on `id`, so position carries no logic, only reading order.

For the colour, note a collision to resolve deliberately: the intel "Guaranteed" highlight already owns amber. Rather than have two golds fight, the mandate takes the app's existing harbour gold accent (`pm-grad-gold` / `pm-text-gold`, the same language the Captain's Legacy card uses) as a filled banner with a scroll glyph, while the intel highlight stays a thin amber outline. Filled versus outlined keeps them distinguishable at a glance even for colour blind players, which a hue change alone would not.

---

## 3. Locked content is listed as if it existed (P2)

**Reported.** The Harbor Roster lists every raw material and product, and so does the market price reference, including when viewing another captain.

**Root cause.** Three surfaces were never migrated to the unlocked pools:

- `GameModals.tsx` player detail cargo iterates `RESOURCES` and `PRODUCTS` directly.
- `PriceTooltips.tsx` gates `priceAwareTermContent` on membership of the full constants.
- `GameStatusPanel.tsx` still hardcodes the three founding artisan rows, so charter artisans never appear there at all. This is the same defect wearing a different hat.

**The interesting part is the other captain case.** To show their unlocked set you need a tier and a round. Difficulty is a room property and therefore identical for everyone, and `PlayerDetailData` already carries `round`. So the correct source is the viewer's own `difficulty` combined with `detail.round`, which needs no protocol change and stays right even if that captain is momentarily a checkpoint behind.

**Long term remedy.** Pass the tier and round into these surfaces and derive from `unlockedResources` / `unlockedProducts` / `unlockedWorkerTypes`, the same selectors the engine already uses, so there is one definition of "what exists right now" shared by the rules and every screen. The price reference additionally returns nothing for a locked item, so no tooltip can advertise a good the captain cannot buy.

---

## 4. Artisan proficiency is invisible (P2)

**Root cause.** `Worker.isSkilled` is real and load bearing: `processProduction` promotes a worker once `producedCount >= 2` and thereafter they produce two items instead of one. The left panel renders `count={list.length}` only, so the single most important fact about a crew, how many are trained, is not shown anywhere in the profile.

**Long term remedy.** Render the roster rows from `unlockedWorkerTypes` (fixing defect 3 in the same stroke) and show trained versus total per type, for example `3 (2 skilled)` with a star marker, and the same in the player detail modal's worker rows. Derived from the roster, so artisans introduced by a future charter are covered without another edit.

---

## 5. Dialogs cannot be closed on tablets (P1)

**Reported.** Display issues on some PCs and tablets; on tablets the other captain's information cannot be dismissed.

**Root cause, and it is a primitive level bug.** `src/components/ui/dialog.tsx` contains no height constraint and no overflow handling at all: searching that file for `max-h` or `overflow-y` returns zero matches. `DialogContent` is positioned `fixed top-[50%] left-[50%]` with `translate-x-[-50%] translate-y-[-50%]`.

The consequence: when content is taller than the viewport, the box is centred, so it overflows **equally above and below** the screen. The close control sits at the dialog's top right, which is now above the top edge of the viewport, and because nothing scrolls there is no way to reach it. The Harbor Roster modal is the tallest surface in the app (stats, legacy card, cargo, workers, modules, and a log tail), so it is the first to cross the threshold, and it crosses it exactly on shorter viewports: tablets and laptops.

This also explains the vaguer "display issues on some PCs": it is the same overflow, just less often fatal.

**Long term remedy.** Fix it once in the primitive rather than per modal, because per modal patching guarantees the next tall dialog reintroduces it. Constrain `DialogContent` to a viewport relative maximum height and let its body scroll, keeping the close control pinned and always reachable. Use dynamic viewport units (`dvh`) rather than `vh`, which is what makes it correct on mobile and tablet browsers whose toolbars change the visible height. Add overscroll containment so scrolling the modal does not chain to the page behind it.

Because this file is shadcn generated, the change is kept minimal and commented so a future component regeneration is easy to reapply.

**Verification.** Reduce the viewport to a tablet height, open the tallest modal, and confirm the close control is reachable, the body scrolls, and the backdrop click and Escape still dismiss.

---

## 6. Quantity fields cannot be edited (P1)

**Reported.** You cannot delete "1" and type "4"; in Broker's Favor a number must be fully reselected to change; exceeding the amount held snaps back, making a target value hard to set.

**Root cause.** Every numeric field in the game parses and clamps on each keystroke. There are four, all the same shape:

```ts
onChange={(e) => setOfferAmount(Math.max(1, parseInt(e.target.value, 10) || 1))}
```

in the barter offer and request fields and the financial aid request, and in Broker's Favor with an extra ceiling:

```ts
setFavorQty(
  Math.min(favorHeld, Math.max(1, parseInt(e.target.value, 10) || 1)),
);
```

Three separate consequences fall out of that one line:

- **The field cannot be emptied.** Deleting the last character yields `""`, `parseInt("")` is `NaN`, `NaN || 1` is `1`. The value snaps back to 1 before you can type the replacement, which is exactly "you cannot delete 1 and replace it with 4".
- **Typing is truncated by the ceiling.** With 3 in hand, typing `4` clamps to `3` immediately. Any multi digit target whose leading digits exceed the hold is unreachable by typing.
- **Only select all and overwrite works,** which is the clumsiness reported.

**Long term remedy.** Adopt the standard controlled numeric pattern, as one reusable component rather than four copies. The field holds a raw **string** draft while focused, permits the empty string and intermediate values, and commits (parse, floor, clamp to min and max) on blur and on submit, never on keystroke. Submission already validates independently in the engine, where `callBrokersFavor` rejects an out of range ask with a log line, so committing on blur is safe and the clamp is not the only guard.

Replacing all four call sites with one `QuantityInput` retires the whole class of complaint and means the next numeric field inherits correct behaviour.

---

## 7. The left rail is too long and the log is buried (P3)

**Root cause.** `GameRoom.tsx` lays out three columns and the left rail is simply `space-y-3` wrapping `GameStatusPanel` then `GameLogPanel`, with no height budget and no independent scrolling. The status panel grows with content (artisan rows, outstanding loans, round end obligations), so the log is pushed further down the page as a voyage gets more complicated, and reaching it scrolls the entire page including the centre column you were working in.

**Long term remedy, with a choice to make.** The structural fix is to give the rail its own viewport height and let each panel scroll internally, so the page itself stops scrolling and the log is always on screen:

- **Option A, recommended.** Make the left rail sticky and full height, with the status panel and the log as flex children that each scroll internally (`min-h-0` on both, log given a guaranteed minimum share). The rail stops growing the page, the log is always visible, and the mobile stacking order is untouched.
- **Option B.** Move the log into the right hand tab strip beside chat. Frees the rail entirely, but costs at a glance visibility of the ledger while acting, which is the log's main job.
- **Option C.** Collapsible sections in the status panel. Least structural change, but hides information behind interaction and does not stop the page growing.

Recommendation is A, with the obligations block kept pinned at the top of the rail since it is the one thing a captain must see before spending.

---

## 8. Sequencing and risk

Proposed order, highest harm first, each independently shippable and verifiable:

1. **Defect 1** (hold corruption) with its save sanitizer. Ship alone: it touches state, and it should be observed in isolation.
2. **Defects 5 and 6** (dialog height, quantity inputs). Both are self contained and unblock ordinary play.
3. **Defects 3 and 4** (unlocked only surfaces, proficiency). Naturally one change, since both are the same roster and pool derivation.
4. **Defect 2** (mandate placement and gold treatment).
5. **Defect 7** (rail layout), last because it is the most subjective and benefits from being judged against the now correct panels.

**Risks worth stating.** The dialog change is in a generated primitive and affects every modal, so it needs a pass over each one. The rail change interacts with the existing mobile ordering (`order-2 lg:order-1`) and must not disturb the stacked phone layout. The inventory seeding change alters the shape of a fresh `GameState`, so the save migration must land in the same commit, never after.

---

## 9. Found while fixing, not in the original report

Two defects surfaced during remediation. Both are recorded here because neither
was reported and both would otherwise have shipped.

**Round end wages omitted charter artisans.** `GameStatusPanel` computed the
pending payroll from the three founding artisan types by name. A captain who
hired a Coppersmith or Potter was shown a wages figure, and therefore a Total
Due, that left them out. This is the panel whose entire job is warning a captain
before they overspend, so an understated bill is the worst possible place for
this bug. Now summed across the unlocked roster, with the per artisan breakdown
rows generated from the same source.

**The close control would have scrolled away.** The first attempt at the dialog
fix put the height cap and the scroll on `DialogContent` itself. That is wrong
twice over: an absolutely positioned child of a scrolling box scrolls with the
content, and moving the control to `sticky` would have placed it in the last
grid row, at the bottom. The shipped fix caps the height on the outer shell and
scrolls an inner wrapper, so the control is positioned against something that
never scrolls. The inner wrapper keeps the original `grid gap-4` child layout,
so no call site needed changing.
