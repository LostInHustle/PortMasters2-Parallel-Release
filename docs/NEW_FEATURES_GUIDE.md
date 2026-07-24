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

This is a race between every captain in the harbor. Whoever is the first captain, across the whole room, to complete five trade orders total during this voyage (not five in one round, five total, however many rounds it takes to get there) wins twenty five Gold on the spot, and the entire harbor is told immediately who won.

It does not matter which round it happens in. It could happen in Round 1 if someone plays fast, or it might not happen until Round 4 if everyone is slow to complete orders. It also only happens once per voyage: the instant one captain wins it, the race is over for everyone else, forever, until the voyage restarts.

### What you will actually see on screen

There are three different things to watch for, and which ones you personally see depends on whether you won or not.

**If you are the captain who won:**

- A green success toast notification appears in the corner of your screen. It reads "📣 Word on the Docks!" with a line underneath saying something like "First to complete 5 trade orders this voyage. +25 Gold."
- Your own Gold total, visible in your status panel, jumps up by exactly 25 immediately, at the same moment the toast appears.

**If someone else won instead:**

- You still get a toast notification, but a plainer one (not the green success style), reading "📣 Word on the Docks" with a line telling you who won, for example "Captain Aaron was first to complete 5 trade orders this voyage."

**Everyone in the harbor, winner and everyone else alike, will also see this:**

- A message appears in the shared Harbor chat and log panel, visible to the whole room, reading something like "📣 Word on the Docks: Captain Aaron was first to complete 5 trade orders this voyage, and pockets 25 Gold for it!"

So if you are testing this with a friend, the winner sees a green toast plus the Gold jump, the loser sees a plainer toast with no Gold change, and both of you should see the same chat message land in the shared log at the same moment.

### Step by step: how to confirm it is working

1. Start a voyage with at least two captains in the harbor.
2. Keep track of your own running total of completed trade orders. Every time you successfully complete an order during Phase 2 (Trade Transaction), that counts toward your voyage total, whether it happens in Round 1, Round 2, or later.
3. Race to be the first captain in the room to hit five completed orders total. It is fine if this takes a few rounds; the race has no deadline, it simply ends the moment anyone reaches five.
4. The instant one captain's fifth order is confirmed, watch for the toast on both screens and the chat message in the shared log. Confirm the winner's Gold went up by exactly 25, and confirm the loser's Gold did not change at all from this event.
5. To specifically test that only one person can ever win, try to arrange for two captains to complete their fifth order in the very same round, as close together in time as you can manage. Only one of you should get the green success toast and the Gold; the other should get the plainer "someone else won" toast instead, never both.
6. To confirm it only fires once per voyage, keep playing after the race is decided and complete more orders as either captain. No further "Word on the Docks" toast or chat message should appear again until the host restarts the voyage.

---

## Feature 3: Tidewatch Alerts

### What it actually does, in plain words

This one is not a race, it is a shared reward for the whole harbor doing well together. The moment everyone currently in the harbor's Reputation, all added up together, reaches 500 or more, the game treats that as "a bustling crew has arrived," and from that point on, every single captain's Port Purchase board permanently shows one extra cargo lot to buy from, every round, for the rest of that voyage.

This is deliberately not tied to which difficulty setting the host picked. It never changes how many rounds the voyage lasts, and it never changes which goods are available; it only ever adds exactly one extra card to the board, once triggered, and that extra card stays for good.

### What you will actually see on screen

Unlike Word on the Docks, this is not a race with one winner, it is a shared moment every captain in the room experiences at the same time.

- Every captain currently in the harbor gets a toast notification at the same moment, reading "🌊 Tidewatch Alert" with a description along the lines of "The harbor takes notice of a bustling crew. One more cargo lot joins the Port Purchase board for the rest of this voyage."
- A matching message appears in the shared Harbor chat and log panel, visible to everyone, reading "🌊 Tidewatch Alert: the harbor takes notice of a bustling crew! One more cargo lot joins every captain's Port Purchase board, for the rest of this voyage."
- Starting with the very next Port Purchase phase after this fires, count the cards on your board. If your board normally shows six cards, for example, it should now show seven, and it should keep showing seven (or whatever your normal count plus one) every round from then on.

### Step by step: how to confirm it is working

1. Start a voyage with at least two captains in the harbor.
2. Open the Harbor Roster (Members panel) so you can see everyone's live Reputation, not just your own. Add the numbers together in your head as you play, or just watch for the toast, since the game is doing that addition for you automatically every time anyone's status updates.
3. Play normally, focusing on completing profitable trade orders, since Reputation grows from trading, not from simply holding Gold. Keep playing rounds until the combined total across the whole room reaches 500 or more.
4. The moment that happens, every captain currently in the room should see the toast and the chat message at essentially the same time, not just one person.
5. On the very next Port Purchase phase that opens after the alert, count your cards. Compare that count to what you saw in earlier rounds; it should be exactly one higher, and it should stay one higher every round after that for the rest of the voyage.
6. One timing detail worth knowing: if the alert fires in the middle of a round, say, during Trade Transaction or Settlement rather than right at the start of Port Purchase, the board you are already looking at that round will not gain a card retroactively. The extra card only ever shows up starting from the next fresh Port Purchase phase, not the one already in progress when the threshold was crossed.
7. To confirm it only fires once per voyage and never reverses, keep playing afterward. You should not see a second Tidewatch toast, and the extra card should not disappear even if Reputation numbers shift around afterward.

---

## Feature 4: Convoy Ventures

### What it actually does, in plain words

This is the one feature that spans many rounds at once, and the one that puts real Gold at risk, not just Gold you might win. Any captain can post a Convoy Venture: a Gold target too large to comfortably fund alone, and a deadline round by which it needs to be reached. From the moment it is posted, any captain in the harbor, including the one who posted it, can chip in Gold toward that target, at any point before the deadline.

If the pooled total reaches the target in time, the venture fills: every single contributor gets back fifty percent more Gold than they put in, in exact proportion to their own share. If the deadline round passes and the venture still has not reached its target, it fails instead: every contributor only gets back half of what they originally put in. The rest is simply lost. That is what makes contributing a real wager on the rest of the harbor coming through, not a free favor with no downside.

Here is the part that matters most: your whole harbor only ever gets to fill one Convoy Venture per voyage, no matter how many captains are in it or how many ventures anyone posts. The instant any single venture fills, that is the harbor's one chance spent for the rest of the voyage. Every other venture still open at that moment is immediately cancelled, with every one of its contributors refunded their full stake, not the smaller partial refund a genuine missed deadline gives. Posting a brand new venture after that point is refused outright, and stays refused until the voyage restarts. This is deliberate: without it, two captains could otherwise fund the same small venture between themselves over and over, each time walking away with fifty percent more Gold than they put in, for free, as many times as they cared to repeat it.

One more limit worth knowing: a venture's deadline can never land on your voyage's actual final round, and it can never be posted at all once the voyage is too close to its own end for any valid deadline to remain. Both exist for the same reason, Gold paid out with no round left afterward to spend it on anything that could raise your final Reputation would not really be much of a reward at all, so the game always guarantees at least one full round remains after the latest possible deadline.

And one more limit beyond that: no single captain can ever fund more than half of any venture's target on their own, no matter how much Gold they personally have. This means a venture can never be filled by one captain alone, not even the one who posted it. It genuinely takes at least one other captain choosing to back it before it can ever complete, which is what makes it a real, cooperative wager on the harbor rather than something one captain could quietly claim for themselves and lock everyone else out of.

### Where to find it and how to use it

Open your own captain's rail (the panel that normally shows your Gold, Reputation, cargo, and so on) and switch to the Dues tab, the same tab that already shows your outstanding loans. Convoy Ventures live directly underneath the loans section.

To post a venture, fill in a Gold target and how many rounds ahead the deadline should be, then press Post. To back an existing venture, type in how much Gold you want to contribute and press Back It. If the venture is already very close to its target, you might ask to contribute more than it actually still needs; the game will only ever take the amount still required to exactly reach the target, and tells you so immediately, it will never take more from you than the venture can actually use.

### What you will actually see on screen

- Every open venture in your harbor shows a small progress bar: current pooled Gold out of the target, along with the round it needs to be filled by.
- If you have personally contributed to a venture, you will see your own contribution total called out underneath its progress bar.
- The moment a venture fills, every contributor sees a green success toast reading "⚓ Convoy Venture filled!" with their own personal share of the payout, and the shared Harbor chat and log panel announces it for the whole room to see, including a note that the harbor's one chance for this voyage has now been used.
- The moment that same fill happens, anyone who had contributed to a different, still open venture instead sees a plainer toast reading "⚓ Convoy Venture cancelled" along with their own full refund, since they did nothing wrong, they simply lost a race they had no way to see coming.
- If a venture instead genuinely misses its own deadline, without any venture in the harbor ever filling, every one of its contributors sees a plainer toast reading "⚓ Convoy Venture missed its deadline" along with their own partial refund, and the shared chat announces that outcome too.
- Once the harbor's one chance has been used, the Dues tab replaces the post form with a short explanation that this voyage's one venture is already spent, rather than silently doing nothing if you try to post again.
- A captain who never contributed to a particular venture will not get a personal toast about it either way, though they will still see the shared chat announcement, since that is visible to the whole room regardless of who was involved.
- Once you have personally backed a venture as much as any single captain is allowed to, that venture's contribution field and button disappear from your own view, replaced by a short note explaining that it needs another captain to fund the rest. Other captains who have not yet hit their own limit can still contribute normally.

### Step by step: how to confirm it is working

You will need at least two captains for this, and ideally enough patience to actually watch a venture through to one of its outcomes, since unlike the first three features this one can take several rounds to resolve.

1. Have one captain open the Dues tab and post a venture with a modest Gold target and a short deadline, just a round or two ahead, so you do not have to wait long to see the result.
2. Have a second captain (or the same captain again) contribute Gold toward it. Confirm the progress bar and the pooled total update for everyone in the room, not just the person who contributed.
3. To test the successful path, keep contributing, from either captain, until the pooled total reaches the target exactly. Confirm every contributor gets the green success toast, with an amount that reads as fifty percent more than what they personally put in, and confirm the shared chat announces the venture as filled.
4. To test the overshoot behavior specifically, try contributing more Gold than the venture still needs when it is already close to its target. Confirm the game only actually takes the amount still required, and does not deduct the rest of what you offered.
5. To confirm the one venture per voyage limit specifically, try posting a second venture right after the first one fills. Confirm the Dues tab now shows the explanatory message instead of the post form, and confirm that if you try anyway, the game refuses it.
6. To test the cancellation path, post two ventures before either fills, contribute a little to both, then fully fund only one of them. Confirm the venture you fully funded pays out normally, and confirm every contributor to the other, still unfilled venture gets a plain toast with their full stake back, not the smaller partial refund.
7. To test the genuine failure path on its own, with only one venture open in the harbor for the whole test, contribute less than its full target and then simply keep playing rounds without ever reaching the target or posting a second venture. Once the room's round moves past that venture's deadline round, confirm every contributor gets the partial refund toast, reading an amount that is exactly half of what they originally put in.
8. If your voyage ends, or the host restarts it, while a venture is still open and short of its target, that venture is treated exactly the same as a missed deadline: every contributor gets their partial refund rather than the venture staying open forever with nobody left to finish funding it. Confirm that after a restart, the Dues tab lets you post a venture again, since a fresh voyage gets its own fresh chance.
9. To confirm the final round limit, wait until your voyage is on its last couple of rounds, then try to post a venture. The "Rounds to fill" field should never let you pick a deadline that lands on the voyage's actual final round, and once you are close enough to the end, the Dues tab should replace the whole post form with a short explanation that it is too late in the voyage to post one at all.
10. To confirm no single captain can fill a venture alone, post one and immediately try to back it yourself with the entire target amount in one contribution. Confirm you are only credited with roughly half of what you offered, confirm the progress bar stops there rather than reaching the top, and confirm your own contribute field disappears in favor of a note saying it needs another captain. Then have a second captain fund the rest, and confirm it fills normally from there.

---

## Also new: Direct Barter Offers

This one is not part of the numbered eighteen, it is a small addition to the Bartering system the game already had. It is worth knowing about anyway, since it fixes a real, easy to run into problem: the original Bartering board is open to the whole harbor, so if you and a friend agree in chat to make a specific trade, there was nothing stopping a third captain from seeing that same offer on the board and accepting it themselves, a moment before your friend got to it.

### What it actually does, in plain words

When you post a barter offer, you can now choose who it is for. Leave it as "Anyone in the harbor" and it behaves exactly as it always has, visible to, and acceptable by, everyone in the room. Choose a specific captain's name instead, and the offer becomes theirs alone: nobody else in the harbor will ever see it exists, and nobody else can accept it, not even by clicking quickly.

### Where to find it and how to use it

It lives right in the existing "Post an Offer" panel during the Bartering window, underneath the usual item and amount fields. A new "With" dropdown defaults to "Anyone in the harbor"; change it to a specific captain's name before posting to make that offer theirs alone.

### What you will actually see on screen

- A direct offer you posted, or one aimed at you, shows a small lock badge reading "Just for [name]" right on the offer itself, so it is easy to tell apart from the ordinary open ones.
- If an offer was not posted for you and was not posted by you, you will simply never see it on your own board at all, it does not appear as greyed out or unavailable, it is not there.

### Step by step: how to confirm it is working

You will need three captains for the most convincing version of this test, though two is enough to confirm the basic behavior.

1. With three captains in the harbor, have one post an offer and choose a second captain's name under "With" instead of leaving it on "Anyone."
2. Confirm the named captain sees the offer on their own board, with the lock badge. Confirm the third, uninvolved captain sees nothing new on their board at all.
3. Have the named captain accept it. Confirm the trade completes normally for both sides, exactly like an ordinary open offer would.
4. Confirm an ordinary offer posted with "Anyone in the harbor" still shows up for every captain in the room, unaffected by any of the above.

---

## Quick reference: what to watch for, side by side

| Feature           | Who sees it                                                                                  | Where it shows up                                                                                                                                                                                                                               | How often it can happen                                                                                                                                    |
| ----------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The Harbor Pulse  | Everyone, but silently                                                                       | Only visible as a subtle price shift on the Port Purchase board, no toast or chat message at all                                                                                                                                                | Every round from Round 2 onward, recalculated fresh each time                                                                                              |
| Word on the Docks | Everyone, but the winner sees something different from everyone else                         | A toast for every captain (green and Gold plus 25 for the winner, a plainer one naming the winner for everyone else), plus one shared chat message for the whole room                                                                           | Once per voyage, whoever gets there first                                                                                                                  |
| Tidewatch Alerts  | Everyone, identically                                                                        | A toast for every captain in the room, plus one shared chat message, plus one extra card on the Port Purchase board from then on                                                                                                                | Once per voyage, the moment the room's combined Reputation crosses 500                                                                                     |
| Convoy Ventures   | Only contributors get a personal toast, but everyone sees the shared chat message either way | A progress bar per open venture in the Dues tab of your captain's rail, a toast on fill, failure, or cancellation for contributors, a shared chat message for the whole room, and a locked out post form once the voyage's one venture is spent | Only one venture can ever fill per voyage, room wide; once that happens every other open venture is cancelled and posting is disabled until a fresh voyage |

---

## Status: what exists in the game right now versus what is still planned

This document only covers the four features that actually exist in the game as of this writing. Fourteen more are planned as part of the same larger project but have not been built yet, so please do not go looking for them; if you do not see something described in the broader project plan, it almost certainly just has not been built yet rather than being broken.

**Built and playable right now:**

1. The Harbor Pulse
2. Word on the Docks
3. Tidewatch Alerts
4. Convoy Ventures

**Planned, not yet built:**

5. Backing
6. Partial Sight
7. Bequest Routing
8. Trading Houses
9. House Rally
10. Ages of the Ledger
11. Captain's Rival
12. Voyage Chronicle
13. Ledger Integrity Pass
14. Harbor Watch
15. Bilingual Harbor
16. Colorblind Safe Palette
17. Quick Start Match
18. Fleet Ticker

As each of the remaining fourteen gets built, this document should grow a matching section for it, written the same way: what it does in plain words, exactly what you will see on screen, and a step by step way to confirm it yourself while actually playing.
