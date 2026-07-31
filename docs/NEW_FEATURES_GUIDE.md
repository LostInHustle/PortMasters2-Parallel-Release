# New Features Guide: What They Do and How to Tell They're Working

This document is written for a player sitting down to actually play the game, not for a developer reading code. It explains each new feature in plain language, tells you exactly where to look on screen, and walks through a specific set of steps you (and a friend, since most of these need two or more captains in the same harbor) can follow to confirm each one is really working while you play.

Ten of these features exist in the game right now. Seven more are planned but not yet built, and one was dropped, so you will not find any of those eight if you go looking, that is expected and not a bug. The status list at the very bottom of this document tells you exactly which is which, so check there first if you are ever unsure whether something should be visible yet.

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

## Feature 5: Backing

### What it actually does, in plain words

Financial Aid already let one captain lend Gold to another who was short on wages or maintenance. Backing adds a third role to that same loan: any other captain in the harbor, not the lender and not the borrower, can now pledge some of their own Gold as a safety net for the lender, on any loan currently outstanding anywhere in the room.

The pledge comes out of your own Gold the instant it is accepted, exactly the same moment a barter offer or an aid loan already leaves your hands. From there it just sits in reserve. If the loan is eventually repaid in full, whether the borrower pays it back themselves or it gets settled automatically at the end of the voyage, your whole pledge comes back to you untouched, plus a small Reputation bonus for having genuinely put Gold at risk that paid off. That bonus is smaller than what the lender themselves earns for the same loan, since backing is a supporting role, not the one doing the actual lending.

If instead the borrower comes up short, your pledge is what covers the gap, up to whatever you pledged and not a Gold coin more. The lender still eats any shortfall bigger than your pledge; backing narrows the lender's risk, it does not erase it. Whatever part of your pledge was not actually needed comes back to you regardless, you are never left worse off than the amount that genuinely had to cover the shortfall.

Only one captain can back any given loan, and you cannot back a loan you are already the lender or the borrower on, since you already have your own stake in how that one turns out.

One ceiling covers both sides of helping. Across a whole voyage, everything you earn from lending Gold and from backing someone else's loan is capped together, and the cap depends on how long the voyage is: 96 Reputation on Fair Winds, 120 on Open Waters, 144 on Monsoon Season. A longer voyage offers more chances to help and holds far more Gold by its midpoint, so one fixed number for all three would have been mean to the long tier and generous to the short one. Each of those is worth five times its own number in Gold lent, so even the shortest tier covers three sizeable bailouts without cutting you off. The ceiling exists because without it two captains could agree in chat to pass one large loan back and forth, banking a fifth of it as Reputation each time. Without that ceiling, two captains could agree in chat to pass one large loan back and forth, banking a fifth of it as Reputation each time, which is why it exists.

### Where to find it and how to use it

Every outstanding loan in your harbor, not just the ones you are personally involved in, is now visible on the Settlement screen, in a new "Loans You Could Back" section right underneath "Captains Asking for Help." Type in how much Gold you want to pledge and press the Back button.

### What you will actually see on screen

- Every loan neither lent nor borrowed by you, and not already backed by someone else, appears in the "Loans You Could Back" list, naming the lender, the borrower, and the loan's full amount.
- Once you back a loan, it drops out of everyone else's "Loans You Could Back" list, since only one backer is ever allowed per loan.
- If a loan you backed is repaid in full and never needed your pledge, your own Gold and Reputation totals both go up the moment it settles, no separate action required on your part.
- If a loan you backed genuinely came up short, your own Gold total still goes up by whatever part of your pledge was not called on, even though no Reputation bonus is earned that time.
- The lender on a loan you backed sees their own Gold total rise by the amount you covered, on top of, not instead of, whatever the borrower managed to pay back directly.

### Step by step: how to confirm it is working

You will need at least three captains for this: one to borrow, one to lend, and one to back the loan.

1. Have one captain request Financial Aid on the Settlement screen, and a second captain lend it to them. Confirm the loan now appears in a third captain's "Loans You Could Back" list, not just visible to the two directly involved.
2. Have the third captain pledge some Gold to back it. Confirm that Gold leaves their own total immediately, and confirm the loan disappears from everyone else's "Loans You Could Back" list from that point on.
3. To test the loan being repaid in full, have the borrower repay it before the voyage ends. Confirm the backer's own Gold rises by their full pledge, and confirm their Reputation also rises by a smaller amount than what the lender earned for the same loan.
4. To test a genuine shortfall, leave a backed loan unpaid until the voyage's final round, so it gets settled automatically with the borrower short on Gold. Confirm the backer's pledge only covers up to what they actually pledged, confirm the lender still receives the borrower's own partial payment plus the backer's coverage on top of it, and confirm no Reputation bonus is granted to the backer this time.
5. To confirm the one backer per loan rule, try to have a fourth captain back a loan someone else already backed. Confirm the game refuses it.
6. To confirm you cannot back your own loan, try backing a loan you personally lent, or one you personally borrowed. Confirm both are refused.

---

## Feature 6: Bequest Routing

### What it actually does, in plain words

Backing already made the Settlement screen show every outstanding loan in the harbor, not just the two captains directly involved. Bequest Routing builds on that same visibility from the other end: the moment your own voyage ends in bankruptcy, any loan you had lent out that is still unpaid can be redirected, right there on the Bankruptcy screen, to a different, still active captain in the room, so a repayment that comes in after your voyage is already over lands somewhere it can still be spent instead of sitting on an account with no voyage left to use it in.

This only ever changes who receives the Gold when the loan is eventually repaid. It never changes who is owed the debt, how much they owe, or when it is due; the borrower still repays the same amount, at the same time, exactly as they always would have.

### Where to find it and how to use it

The moment your own voyage ends in bankruptcy, look at the Silent Partner section on your own Bankruptcy screen, the same section that already lists every loan still owed to you. Underneath each one, if there is at least one other captain currently in the harbor to redirect it to, you will see a small "Send repayment to" dropdown, defaulting to "myself." Choose another captain's name to redirect that specific loan; choose "myself" again at any time to undo it.

### What you will actually see on screen

- The dropdown is per loan, not room wide: you can redirect one outstanding loan to one captain and leave another loan pointed at yourself, if you have more than one still open.
- Redirecting is silent and immediate, no toast, since it is purely a choice you are making about your own account, not something that has happened yet.
- When the loan is actually repaid, the captain you redirected it to sees their own Gold rise by the repaid amount, with the same kind of quiet log entry an ordinary loan repayment already produces for a lender.
- Your own Bankruptcy screen, meanwhile, simply stops listing that loan once it closes: you do not receive the Gold, since you chose to send it elsewhere, but you also are not left staring at a debt that looks unpaid forever after it has actually been settled.

### Step by step: how to confirm it is working

You will need three captains for this: one to eventually go bankrupt after lending Gold out, one to borrow it, and a third to receive the redirected repayment.

1. Have the first captain lend Gold to the second through Financial Aid on the Settlement screen, same as any ordinary loan.
2. Play the first captain (the lender) down to bankruptcy, deliberately if you need to, by letting their Gold run out before wages and maintenance are covered.
3. On the bankrupt captain's own Bankruptcy screen, find the loan in the Silent Partner section and use its "Send repayment to" dropdown to choose the third captain instead of leaving it on "myself."
4. Have the borrower repay the loan, either voluntarily on the Settlement screen or by letting it ride to the forced settlement at the end of the voyage's final round.
5. Confirm the third captain's own Gold rises by the repaid amount, not the bankrupt captain's. Confirm the bankrupt captain's own loan entry disappears from their Silent Partner list once it settles, exactly as it would if they had been repaid directly themselves.
6. To confirm a redirect can be changed before it matters, repeat the test but switch the dropdown back to "myself" before the loan is repaid. Confirm the Gold lands back on the original bankrupt captain's own account in that case, not the third captain's.

---

## Feature 7: Harbor Watch

### What it actually does, in plain words

Before this, the only tool a host had for dealing with one disruptive captain in room chat was restarting the entire voyage, resetting everyone's progress, not just the one person causing trouble. Harbor Watch gives the host a much smaller, much more targeted tool instead: silencing one specific captain's room chat for the rest of the current voyage, without touching their Gold, cargo, ship, or progress in any way. A muted captain keeps playing normally; they simply cannot post to room chat until the voyage ends or the host lifts the mute.

Direct messages are completely unaffected. A mute only ever applies to the shared room channel everyone in the harbor reads.

### Where to find it and how to use it

Only the host sees this control. On the Harbor Roster, hover the row of any captain other than yourself, and a small speaker icon appears on the right side of their row. Click it to mute them; the icon changes to a crossed out speaker, and clicking it again unmutes them.

### What you will actually see on screen

- A muted captain's row on the Harbor Roster, visible to every captain in the room, not just the host, shows a small red "muted" tag next to their name.
- If you are the muted captain yourself, your own room chat's message box is replaced with a short note explaining that the host has muted you for the rest of this voyage, in place of the usual text field and send button. Direct messages still work normally.
- If you try to send a room chat message from a stale tab or an old page state while muted, nothing appears in the chat log for anyone; the attempt is silently rejected.
- Unmuting immediately restores the normal message box for that captain, no reload required.

### Step by step: how to confirm it is working

You will need at least two captains, one of whom is the host, and it helps to have a third to confirm what an uninvolved captain sees.

1. As the host, hover a non-host captain's row on the Harbor Roster and click the speaker icon to mute them.
2. Confirm every captain in the room, not just the host, sees the "muted" tag appear on that captain's roster row.
3. On the muted captain's own screen, confirm their room chat input is replaced with the explanatory note, and confirm they cannot send a room chat message.
4. Confirm the muted captain can still send and receive direct messages normally, and confirm they can still read the room chat that others post, they simply cannot post to it themselves.
5. As the host, click the speaker icon again to unmute them. Confirm their message box returns to normal immediately, and confirm the "muted" tag disappears from their roster row for everyone.
6. To confirm this is host only, try to find a mute control on a non-host captain's own view of the roster. There should not be one, on any row, including their own.
7. To confirm a mute does not survive a restart, mute a captain, then have the host restart the voyage. Confirm the newly started voyage shows nobody as muted.

---

## Feature 8: Colorblind Safe Palette

### What it actually does, in plain words

Every good in the game, Hemp, Silk, Tea, and everything crafted from them, is normally shown in a fixed color wherever its name appears: your cargo hold, the trade board, barter offers, and so on. Two of those colors, Silk's crimson red and Tea's forest green, sit close enough together on the color wheel that a red green colorblind captain, the most common form of color vision deficiency by a wide margin, can have real trouble telling them apart at a glance. This feature adds a second, complete color mapping for the same set of goods, built specifically so every good stays distinguishable under the common forms of colorblindness, and lets any player switch to it whenever they like.

This only ever changes how your own client draws colors already being shown to you. It never changes game rules, balance, or what any other captain sees; two captains in the same room can even have it toggled differently from each other with no effect on the game itself.

### Where to find it and how to use it

In the game room's header, next to the notification bell, is a small palette icon button. Click it to switch to the colorblind safe palette; click it again to switch back to the default colors. The icon itself changes color to show which mode is currently active.

### What you will actually see on screen

- Every place a good's name is shown in color, your cargo hold, the Port Purchase board, Bartering, Worker Management, Trade Transaction, and any captain's detail popup, switches to the new palette the instant you click the toggle, with no page reload.
- Your choice is remembered on your own device: it stays on the next time you open the game, and it applies in every room you join, not just the one you were in when you turned it on.
- Nobody else in the room sees any difference on their own screen when you toggle yours; it is entirely personal to your own client.

### Step by step: how to confirm it is working

A single captain can fully confirm this alone; no second player is required.

1. Open your cargo hold (your own status panel's Hold tab) and note the colors shown for Silk and Tea specifically, the pair this feature exists to fix.
2. Click the palette icon in the header. Confirm the icon itself changes appearance to show the colorblind safe palette is now active.
3. Look at Silk and Tea again in the same place. Confirm both colors changed, and confirm the two are now clearly different from each other, not just subtly shifted.
4. Check a few other places the same goods are shown in color, the Port Purchase board and a Bartering offer are good spots, and confirm the new palette is applied consistently everywhere, not just in the one place you first checked.
5. Click the palette icon again to switch back. Confirm every place you checked returns to the original colors.
6. Reload the page (or leave the room and come back) with the colorblind safe palette left on. Confirm it is still on after reloading, since the choice is meant to persist.

---

## Feature 9: Fleet Ticker

### What it actually does, in plain words

The Harbor Roster already shows every captain's live round, phase, Gold, and Reputation at a glance, but on a phone or a narrow browser window it sits at the very bottom of the page, behind the phase panel you are actively playing in, so seeing it means scrolling past everything else first. Fleet Ticker adds a second, much smaller summary of the exact same information, a slim strip pinned directly under the room's header, visible on every screen size without scrolling past anything.

This is not a replacement for the Harbor Roster, which still has the fuller per-captain detail, the mute control, and the click through to each captain's full detail popup. It exists specifically to close the gap the roster's own scrolling position leaves open on a small screen.

### Where to find it and how to use it

It is always there, directly below the room name and code at the top of the screen, above the main three column layout. There is nothing to click or turn on; it is a passive display only.

### What you will actually see on screen

- One small chip per captain in the room, showing their avatar, their name (or "You" for your own), their current phase, and their Gold and Reputation, laid out in a single horizontal row.
- A captain who has gone bankrupt shows a plain "Bankrupt" label in their chip instead of Gold and Reputation, the same as the Harbor Roster already does.
- If the room has more captains than fit on screen at once, the strip scrolls horizontally rather than wrapping to a second line, keeping it a single slim row regardless of room size.
- With only one captain in the room (nobody to compare against yet), the strip does not appear at all, since there is nothing for it to summarize.

### Step by step: how to confirm it is working

You will need at least two captains in the harbor; with only one, the strip is not shown at all, which is itself worth confirming.

1. With a single captain in the room, confirm the strip does not appear anywhere under the header.
2. Have a second captain join. Confirm the strip now appears, showing a chip for each captain, including one labeled "You" on your own screen and showing that same captain by name on the other captain's screen.
3. Have one captain buy something or complete a trade. Confirm their chip's Gold and phase update for everyone watching, without anyone needing to refresh or click anything.
4. Narrow your browser window (or check on an actual phone) and confirm the strip stays visible directly under the header the whole time, never disappearing behind the phase panel the way the fuller roster does on a narrow screen.
5. Let one captain go bankrupt. Confirm their chip switches to the plain "Bankrupt" label instead of showing Gold and Reputation, matching what the Harbor Roster already shows for the same captain.

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

## Feature 10: Ledger Integrity Pass

### What it actually does, in plain words

Every captain's browser works out its own Gold and Reputation and then posts the result to the server to be saved. Until now the server checked only that the message had the right shape, never that the numbers inside it could have come from a real voyage, so a doctored save was written exactly as sent.

This adds one check at that save endpoint. When a save arrives claiming more Gold or Reputation than the game could possibly have produced by the round the room has actually reached, the save is still written, but the row is marked as suspect and a line is logged on the server.

It deliberately never rejects a save or interrupts a voyage. A captain halfway through a game must never lose it to a mistaken guard, so the ceiling is set from the theoretical maximum rather than from what real play looks like: it allows several times the top merchant rating in a single round. It catches a figure claiming millions. It will not catch one quietly padded by fifty, and it is not meant to.

There are two bands. **Suspect** is a tenth of the way to the ceiling: still far past a genuine high scoring round, so it proves nothing on its own. It is recorded and nothing else happens, and it exists so there is real data to tighten the upper band with later. **Impossible** is over the ceiling itself, or a figure that is broken outright such as a negative or a NaN. Only that band has a consequence.

That consequence lands at the end of the voyage rather than during it. A captain who finishes on an impossible figure still finishes, still appears in the final standings, and keeps whatever happened inside that voyage. What they do not get is anything that outlives it: no Renown XP, no merits, and no Sea Master crown. They are also taken out of the running for the crown entirely rather than crowned and then stripped, so an invented score can never deny the crown to the captain who actually earned it.

This matters more than the save check on its own, because the save endpoint is not how a voyage's numbers become permanent. The conclusion reads the live status every client reports a few times a minute. A client that kept its saves ordinary and only inflated that status would otherwise have banked Renown with nothing in its way.

The reverse also had to be closed. A captain could forge a save early in a voyage, spend the Gold down, and finish reporting perfectly ordinary figures, which a check that only looks at the final total would wave through. So the conclusion consults two things and either one is enough to disqualify: what you finish holding, and whether any save you sent during the voyage was already marked impossible. The mark is never cleared, so the game remembers what was claimed even after the evidence has been spent.

The reason it exists now rather than later is that Trading Houses, Ages of the Ledger and Captain's Rival all read account level standings. A forged score used to spoil one voyage. Once those three exist, it would spoil a permanent record everyone else can see.

### What you will actually see on screen

Nothing, in ordinary play. This is the one feature here with no interface at all. A normal voyage never approaches the ceiling, the response to a save is unchanged whether or not it tripped, and a captain who does trip it is told nothing, deliberately, so that a tampering client learns nothing about the guard.

The only visible trace is server side: a `[integrity]` warning in the process log, and `integritySuspect` set on that captain's row in the `GameState` table.

### Step by step: how to confirm it is working

You need a way to send a request directly, since the game itself will never produce a tripping save.

1. Register a captain, create a room, and have a second captain join so the voyage can start. Play a round or two normally, then confirm nothing has been flagged: `integritySuspect` on your `GameState` row is still false, and the server log is quiet.
2. With the same session cookie, `PUT /api/game/state` with that room's id and a data object containing `money` set to 9999999. Confirm the response is the ordinary success, identical in shape to a normal save.
3. Confirm the server log now carries one `[integrity]` line naming the field, the claimed value and the ceiling it exceeded.
4. Confirm `integritySuspect` on that row is now true and `integrityNote` records what tripped.
5. Save normally again, and confirm the flag stays true. It is never cleared automatically, since the point is that the account claimed it at least once.
6. To confirm the guard cannot fire on real play, finish a voyage at the top merchant rating and confirm the flag is still false.
7. To confirm the consequence, have one captain report an impossible Reputation and finish the voyage. Confirm they still appear in the standings, confirm their Renown XP for that voyage is zero, confirm no new merits were granted, and confirm the crown went to the highest scoring honest captain rather than to nobody.
8. To confirm the memory, do the same thing in reverse. Send one impossible save early in a voyage, then play on and finish with entirely ordinary Gold and Reputation. The figures you finish on would pass on their own, so this is the case the stored mark exists for: confirm the voyage still banks no Renown and no merits, and that the server log names an earlier save as the reason rather than the final total.

---

## Quick reference: what to watch for, side by side

| Feature                 | Who sees it                                                                                  | Where it shows up                                                                                                                                                                                                                               | How often it can happen                                                                                                                                    |
| ----------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The Harbor Pulse        | Everyone, but silently                                                                       | Only visible as a subtle price shift on the Port Purchase board, no toast or chat message at all                                                                                                                                                | Every round from Round 2 onward, recalculated fresh each time                                                                                              |
| Word on the Docks       | Everyone, but the winner sees something different from everyone else                         | A toast for every captain (green and Gold plus 25 for the winner, a plainer one naming the winner for everyone else), plus one shared chat message for the whole room                                                                           | Once per voyage, whoever gets there first                                                                                                                  |
| Tidewatch Alerts        | Everyone, identically                                                                        | A toast for every captain in the room, plus one shared chat message, plus one extra card on the Port Purchase board from then on                                                                                                                | Once per voyage, the moment the room's combined Reputation crosses 500                                                                                     |
| Convoy Ventures         | Only contributors get a personal toast, but everyone sees the shared chat message either way | A progress bar per open venture in the Dues tab of your captain's rail, a toast on fill, failure, or cancellation for contributors, a shared chat message for the whole room, and a locked out post form once the voyage's one venture is spent | Only one venture can ever fill per voyage, room wide; once that happens every other open venture is cancelled and posting is disabled until a fresh voyage |
| Backing                 | Every captain sees every outstanding loan, not just the two directly involved                | A "Loans You Could Back" section on the Settlement screen, and each backer's own Gold and Reputation totals updating silently the moment a backed loan settles                                                                                  | Any time a loan is outstanding, until it is repaid or backed by someone; one backer per loan, and it clears automatically at the end of every voyage       |
| Bequest Routing         | Only the bankrupt lender chooses it; only the redirect target sees the eventual Gold         | A "Send repayment to" dropdown per loan on the Bankruptcy screen's Silent Partner section                                                                                                                                                       | Any time you are bankrupt with an outstanding loan still owed to you; changeable at any point before that loan is actually repaid                          |
| Harbor Watch            | Everyone sees the "muted" tag; only the muted captain sees the disabled chat input           | A speaker icon on the Harbor Roster (host only), a "muted" tag on the roster row, and a disabled chat input for the muted captain                                                                                                               | Toggled by the host at any time; clears automatically when the host restarts the voyage                                                                    |
| Colorblind Safe Palette | Entirely personal; nobody else in the room sees your choice                                  | A palette icon in the game room header, and every place a good's name is shown in color everywhere else                                                                                                                                         | Toggled at any time, remembered on your own device across rooms and sessions                                                                               |
| Fleet Ticker            | Everyone in the room, identically                                                            | A slim strip directly under the header, always visible on every screen size                                                                                                                                                                     | Continuously, the moment there are at least two captains in the room                                                                                       |

---

## Status: what exists in the game right now versus what is still planned

This document now covers the ten features that actually exist in the game as of this writing. Seven more are planned and one has been dropped, so please do not go looking for those eight, if you do not see something described here, it almost certainly just has not been built yet rather than being broken.

The design source for all eighteen, with what each one does and why, now lives in [HARBOR_MANIFEST.md](HARBOR_MANIFEST.md) alongside this file. Where the two disagree, that file is right about intent and this one is right about what is actually playable.

**Built and playable right now:**

1. The Harbor Pulse
2. Word on the Docks
3. Tidewatch Alerts
4. Convoy Ventures
5. Backing
6. Bequest Routing
7. Harbor Watch
8. Colorblind Safe Palette
9. Fleet Ticker
10. Ledger Integrity Pass

**Planned, not yet built:**

11. Partial Sight
12. Trading Houses
13. House Rally
14. Ages of the Ledger
15. Captain's Rival
16. Voyage Chronicle
17. Quick Start Match

**Dropped, not pending:** Bilingual Harbor, which was entry 15 in the original manifest. English and Chinese localization was built in full and then removed at the project owner's request, so it is not outstanding work and should not be picked back up without a fresh decision.

The manifest also recommends an order that is not this numeric one, since it sequences by dependency instead. Of what remains, Quick Start Match and Voyage Chronicle are the two with no blockers at all; the other five each need either a dependency they build on or a design decision (a balance session, a banding numbers pass, a rollover cadence, an eligibility rule) answered first, all called out in the manifest's own open questions section.

As each of the remaining seven gets built, this document should grow a matching section for it, written the same way: what it does in plain words, exactly what you will see on screen, and a step by step way to confirm it yourself while actually playing.
