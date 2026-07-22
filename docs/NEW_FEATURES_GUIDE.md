# New Features Guide: What They Do and How to Tell They're Working

This document is written for a player sitting down to actually play the game, not for a developer reading code. It explains each new feature in plain language, tells you exactly where to look on screen, and walks through a specific set of steps you (and a friend, since most of these need two or more captains in the same harbor) can follow to confirm each one is really working while you play.

Three of these features exist in the game right now. The other fifteen are planned but not yet built, so you will not find them if you go looking, that is expected and not a bug. The status list at the very bottom of this document tells you exactly which is which, so check there first if you are ever unsure whether something should be visible yet.

## Before you start: where to actually look

Every feature below announces itself, or can be confirmed, through one or more of these four places in the game's own screen. It helps to know all four before you start testing, so you are not staring at the wrong corner of the screen waiting for something that already happened somewhere else.

1. **The toast notification.** A small message box that pops up briefly in a corner of the screen and fades away on its own. This is how the game tells you, personally, that something just happened to you or your captain.
2. **The Harbor chat and log panel.** The shared, scrolling feed every captain in the room can see, the same place your regular chat messages and the game's own automatic announcements appear. Anything written here is visible to the whole room, not just you.
3. **The Harbor Roster (Members panel).** The list of every captain currently in your harbor, each showing their live Gold and Reputation. This is how you check on the whole room's numbers, not just your own.
4. **Your own status panel and the Port Purchase board.** Your personal Gold, Reputation, and the cards actually available to buy each round. This is where you check whether a change actually affected your own game, as opposed to just being announced.

Two of the three features below (Word on the Docks and Tidewatch Alerts) are loud: they trigger a toast, a chat message, or both, the moment they happen. One of them (The Harbor Pulse) is deliberately quiet and has no on screen announcement at all, which is explained in its own section below, along with the most reliable way to still confirm it is doing something.

You will need at least two people playing in the same harbor to properly test any of these three. All three depend on things multiple captains do together (buying, trading, building Reputation), so testing alone in a room by yourself will not reliably trigger any of them.

---

## Feature 1: The Harbor Pulse

### What it actually does, in plain words

Normally, the price you see for Hemp, Silk, or Tea at a port is random, drawn fresh each round from a fixed price range that never changes no matter what anyone does. The Harbor Pulse changes that slightly: it makes the market pay attention to what your whole harbor actually bought the round before.

If everyone in the room bought a lot of one good last round, say, everyone piled into Silk, that good gets a little more expensive this round, because demand for it was clearly high. If a good barely got touched last round, say nobody bought any Tea at all, that good gets a little cheaper this round, because there was no demand for it. The size of this nudge is capped at about twelve percent up or down, so it is a lean in one direction, never a dramatic price swing.

Think of it like a real dock: if you watch what everyone else is loading onto their ships, you can guess where prices are heading before they actually move. That is the whole idea. Nobody announces it, nobody controls it directly, it is simply a consequence of what the room did together.

### Why there is nothing to see when it happens

Unlike the next two features, the Harbor Pulse has no toast, no chat message, and no on screen indicator of any kind. This is intentional: it is meant to be read the way a real trader reads a crowded dock, not handed to you as a headline. That also means it is the hardest of the three to visually confirm just by glancing at the screen, so the steps below are more deliberate than the other two.

It only ever affects Round 2 onward. Round 1 always starts from a completely neutral market, since there is no previous round's buying to react to yet.

### Step by step: how to confirm it is working

You will need two captains (call them Captain A and Captain B) in the same harbor, and you will need to coordinate a little before you start, since the whole point is testing what happens when the room leans hard into one good and ignores another.

1. Start a voyage with both captains in the harbor.
2. On Round 1's Port Purchase phase, have Captain A buy every Silk card available on the board, as many as they can afford, and skip every Hemp and Tea card entirely. At the same time, have Captain B buy every Hemp and every Tea card available, and skip every Silk card entirely.
3. Finish Round 1 normally: complete the Bartering window (skip it if you like), go through Trade Transaction, Settlement, and Upgrade as usual, then let the voyage move into Round 2.
4. When Round 2's Port Purchase phase opens, look closely at the Silk prices on the board compared to what you remember seeing in Round 1. They should read a little higher than a typical Round 1 Silk price. Compare that against Hemp and Tea, which should read a little lower than what you saw in Round 1.
5. The shift is subtle by design (up to about a twelve percent lean, not a doubling or halving of price), so do not expect it to jump out at you on a single card. The most reliable way to actually notice it is to look at several Silk cards across the round and compare the general price level, not just one card in isolation.

If you want a stronger, more obvious signal, repeat the same test but have both captains buy as many cards of one single good as they possibly can (for example, both of you only ever touch Silk, and neither of you ever touches Hemp or Tea at all). That pushes the lean toward its maximum in both directions at once, which makes the Round 2 price difference easier to actually see.

### An honest caveat

Because there is no on screen label confirming this is active, and because base prices are still randomized within a range even with the pulse applied, you are reading a general trend rather than a single guaranteed number. If you genuinely need certainty rather than a visual impression, that is a fair thing to ask a developer to check directly against the numbers the game generated that round, rather than relying on eyeballing the board. A small on screen indicator for this feature (something as simple as a one line note in the Harbor chat saying "the market leans toward Silk this round") is a reasonable future improvement if this stays too hard to notice during ordinary play, worth raising with the team if it bothers you.

---

## Feature 2: Word on the Docks

### What it actually does, in plain words

This is a race between every captain in the harbor. Whoever is the first captain, across the whole room, to complete three trade orders total during this voyage (not three in one round, three total, however many rounds it takes to get there) wins twenty five Gold on the spot, and the entire harbor is told immediately who won.

It does not matter which round it happens in. It could happen in Round 1 if someone plays fast, or it might not happen until Round 4 if everyone is slow to complete orders. It also only happens once per voyage: the instant one captain wins it, the race is over for everyone else, forever, until the voyage restarts.

### What you will actually see on screen

There are three different things to watch for, and which ones you personally see depends on whether you won or not.

**If you are the captain who won:**

- A green success toast notification appears in the corner of your screen. It reads "📣 Word on the Docks!" with a line underneath saying something like "First to complete 3 trade orders this voyage. +25 Gold."
- Your own Gold total, visible in your status panel, jumps up by exactly 25 immediately, at the same moment the toast appears.

**If someone else won instead:**

- You still get a toast notification, but a plainer one (not the green success style), reading "📣 Word on the Docks" with a line telling you who won, for example "Captain Aaron was first to complete 3 trade orders this voyage."

**Everyone in the harbor, winner and everyone else alike, will also see this:**

- A message appears in the shared Harbor chat and log panel, visible to the whole room, reading something like "📣 Word on the Docks: Captain Aaron was first to complete 3 trade orders this voyage, and pockets 25 Gold for it!"

So if you are testing this with a friend, the winner sees a green toast plus the Gold jump, the loser sees a plainer toast with no Gold change, and both of you should see the same chat message land in the shared log at the same moment.

### Step by step: how to confirm it is working

1. Start a voyage with at least two captains in the harbor.
2. Keep track of your own running total of completed trade orders. Every time you successfully complete an order during Phase 2 (Trade Transaction), that counts toward your voyage total, whether it happens in Round 1, Round 2, or later.
3. Race to be the first captain in the room to hit three completed orders total. It is fine if this takes a few rounds; the race has no deadline, it simply ends the moment anyone reaches three.
4. The instant one captain's third order is confirmed, watch for the toast on both screens and the chat message in the shared log. Confirm the winner's Gold went up by exactly 25, and confirm the loser's Gold did not change at all from this event.
5. To specifically test that only one person can ever win, try to arrange for two captains to complete their third order in the very same round, as close together in time as you can manage. Only one of you should get the green success toast and the Gold; the other should get the plainer "someone else won" toast instead, never both.
6. To confirm it only fires once per voyage, keep playing after the race is decided and complete more orders as either captain. No further "Word on the Docks" toast or chat message should appear again until the host restarts the voyage.

---

## Feature 3: Tidewatch Alerts

### What it actually does, in plain words

This one is not a race, it is a shared reward for the whole harbor doing well together. The moment everyone currently in the harbor's Reputation, all added up together, reaches 250 or more, the game treats that as "a bustling crew has arrived," and from that point on, every single captain's Port Purchase board permanently shows one extra cargo lot to buy from, every round, for the rest of that voyage.

This is deliberately not tied to which difficulty setting the host picked. It never changes how many rounds the voyage lasts, and it never changes which goods are available; it only ever adds exactly one extra card to the board, once triggered, and that extra card stays for good.

### What you will actually see on screen

Unlike Word on the Docks, this is not a race with one winner, it is a shared moment every captain in the room experiences at the same time.

- Every captain currently in the harbor gets a toast notification at the same moment, reading "🌊 Tidewatch Alert" with a description along the lines of "The harbor takes notice of a bustling crew. One more cargo lot joins the Port Purchase board for the rest of this voyage."
- A matching message appears in the shared Harbor chat and log panel, visible to everyone, reading "🌊 Tidewatch Alert: the harbor takes notice of a bustling crew! One more cargo lot joins every captain's Port Purchase board, for the rest of this voyage."
- Starting with the very next Port Purchase phase after this fires, count the cards on your board. If your board normally shows six cards, for example, it should now show seven, and it should keep showing seven (or whatever your normal count plus one) every round from then on.

### Step by step: how to confirm it is working

1. Start a voyage with at least two captains in the harbor.
2. Open the Harbor Roster (Members panel) so you can see everyone's live Reputation, not just your own. Add the numbers together in your head as you play, or just watch for the toast, since the game is doing that addition for you automatically every time anyone's status updates.
3. Play normally, focusing on completing profitable trade orders, since Reputation grows from trading, not from simply holding Gold. Keep playing rounds until the combined total across the whole room reaches 250 or more.
4. The moment that happens, every captain currently in the room should see the toast and the chat message at essentially the same time, not just one person.
5. On the very next Port Purchase phase that opens after the alert, count your cards. Compare that count to what you saw in earlier rounds; it should be exactly one higher, and it should stay one higher every round after that for the rest of the voyage.
6. One timing detail worth knowing: if the alert fires in the middle of a round, say, during Trade Transaction or Settlement rather than right at the start of Port Purchase, the board you are already looking at that round will not gain a card retroactively. The extra card only ever shows up starting from the next fresh Port Purchase phase, not the one already in progress when the threshold was crossed.
7. To confirm it only fires once per voyage and never reverses, keep playing afterward. You should not see a second Tidewatch toast, and the extra card should not disappear even if Reputation numbers shift around afterward.

---

## Quick reference: what to watch for, side by side

| Feature           | Who sees it                                                          | Where it shows up                                                                                                                                                     | How often it can happen                                                |
| ----------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| The Harbor Pulse  | Everyone, but silently                                               | Only visible as a subtle price shift on the Port Purchase board, no toast or chat message at all                                                                      | Every round from Round 2 onward, recalculated fresh each time          |
| Word on the Docks | Everyone, but the winner sees something different from everyone else | A toast for every captain (green and Gold plus 25 for the winner, a plainer one naming the winner for everyone else), plus one shared chat message for the whole room | Once per voyage, whoever gets there first                              |
| Tidewatch Alerts  | Everyone, identically                                                | A toast for every captain in the room, plus one shared chat message, plus one extra card on the Port Purchase board from then on                                      | Once per voyage, the moment the room's combined Reputation crosses 250 |

---

## Status: what exists in the game right now versus what is still planned

This document only covers the three features that actually exist in the game as of this writing. Fifteen more are planned as part of the same larger project but have not been built yet, so please do not go looking for them; if you do not see something described in the broader project plan, it almost certainly just has not been built yet rather than being broken.

**Built and playable right now:**

1. The Harbor Pulse
2. Word on the Docks
3. Tidewatch Alerts

**Planned, not yet built:** 4. Convoy Ventures 5. Backing 6. Partial Sight 7. Bequest Routing 8. Trading Houses 9. House Rally 10. Ages of the Ledger 11. Captain's Rival 12. Voyage Chronicle 13. Ledger Integrity Pass 14. Harbor Watch 15. Bilingual Harbor 16. Colorblind Safe Palette 17. Quick Start Match 18. Fleet Ticker

As each of the remaining fifteen gets built, this document should grow a matching section for it, written the same way: what it does in plain words, exactly what you will see on screen, and a step by step way to confirm it yourself while actually playing.
