---
title: "AI Is Not an Oracle: The Limits of Machine Learning"
date: 2026-01-20T02:00:00
updated: 2026-01-21T07:12:55
sticky: false
cornerstone: false
excerpt: Machine-learning curves look confident until speedrunners change the
  game underneath them. MediEvil shows why “AI as oracle” fails.
categories:
  - Programming
tags:
  - AI
  - Automation
  - Creativity
  - Gaming
  - Python
coverAlt: Woman at a tarot table with candles, cards, and a glowing crystal
  ball, symbolising fortune-telling and uncertain machine learning predictions.
originalCover: https://buthonestly.io/wp-content/uploads/2025/12/machine-learning-prediction.jpg
---

> [!summary]- Quick Summary
>
> - Speedrunning exposes a core limit of machine learning: you can model execution from past data, but you can’t predict the next skip, the next route change, or the moment a player simply walks away.
> - MediEvil Any% went from a 57-minute clear to a 19:29 world record, mostly through new skips and routes, not raw execution.
> - The public WR curve looks smooth, but underneath it are lumpy jumps: typical improvements are ~10–30 seconds, punctuated by rare, discovery-driven collapses.
> - Models trained only on public PBs tell clean but opposite stories: some predict absurd 14-minute futures, others insist 19:29 is the hard limit.
> - Private logs show a different reality: NoobKillerRoof’s 5,470 attempts, 507 completions, and near-misses never appear on speedrun.com but completely change the forecasts.
> - Even for the same runner, PB-only and grind-aware models disagree on how much room is left and how soon the next PB should arrive.
>
> AI-generated summary based on the text of the article and checked by the author. [Read more](/artificial-intelligence-tools/ "BUT. Honestly Artificial Intelligence Tools") about how BUT. Honestly uses AI.

There’s a special kind of chaos that lives on speedrun leaderboards.

You open a game’s page, scroll through the “World Records” history, and it looks almost reasonable: times go down, slowly, step by step. A few seconds here, a second there. Human effort compresses into a neat little curve.

Then, somewhere in the middle of that curve, there’s a cliff.

The world record doesn’t improve by 0.8 seconds. It drops by thirty.  
Same game. Same category. Same console. Suddenly a different universe.

If you’re not into speedrunning, here’s the short version: a speedrun is beating a game as fast as possible under strict rules. Runners record their attempts, upload them to sites like speedrun.com, and fight for the top of the leaderboard. Over time, a game’s “Any%” category (beat the game as fast as possible, anything goes) builds a history of world records, each slightly faster than the last.

Almost.

Because sometimes a runner finds a new _skip_ — a trick, a glitch, a route change that lets you bypass a boss, load a later level early, or break the game in half. When that happens, the entire idea of a “limit” evaporates. What looked like the asymptote of human performance suddenly turns into a plateau before the next collapse.

## The Cliff in the Curve

This essay is about those collapses, and in particular about MediEvil, the 1998 PlayStation action-adventure game where you run around as Sir Daniel Fortesque, a resurrected skeleton knight with a sword and a lot of unresolved business.

![Skeletal knight Sir Daniel Fortesque from MediEvil standing in a stylised village, used to illustrate machine learning analysis of speedrunning data.](https://i0.wp.com/buthonestly.io/wp-content/uploads/2025/12/machine-learning-medievil-psx.jpg?resize=830%2C623&quality=81&ssl=1 "Sir Daniel Fortesque in the sleeping village – MediEvil (1998).")

I’ve collected a full MediEvil speedrunning dataset: all the official runs from speedrun.com (including mine), plus some private data from runners—failed attempts, local PBs, unsubmitted grinds. That gives us something rare: not just the shiny world records, but a glimpse into the process behind them.

And because I can’t help myself, I wanted to see what happens if we point machine learning at this mess ([[neural-network-predict-resin-usage-3d-printed-miniatures|as I did before]]) and ask a simple, slightly arrogant question:

> _Given all this history, how far can we really predict the future of MediEvil speedrunning?_

We can fit curves. We can simulate “grind-to-PB” progress. We can try to forecast the next world record time. If you’ve seen any “AI predicts the future of X” charts, you already know the drill: smooth lines, confidence intervals, maybe a dramatic conclusion about “approaching the human limit.”

But in speedrunning, the most important improvements are the ones the model cannot see coming: the unknown skips, the glitches nobody has thought to try, and the routes that don’t exist yet.

That’s the core claim of this essay: machine learning is pretty good at predicting the parts of the future that look like the past, and terrible at predicting discoveries that change what’s possible.

### What This Essay Will Do

Here’s the plan.

First, we’ll look at how MediEvil world records have actually evolved. Then we’ll build a couple of simple models to forecast where the record “should” go next if nothing fundamental changes. Finally, we’ll compare those neat forecasts against the chaos introduced by new skips and glitches, and talk about what that says about the limits of machine learning more generally.

I’ll walk through this using the real MediEvil dataset. As we go, I’ll spell out the exact questions I’m answering and the data I’m pulling, so [[vibe-writing-line-between-human-machine|this isn’t just vibes]]; it’s code, charts, and uncomfortable gaps between what the model says should happen and what speedrunners actually do.

## A Very Compressed History of MediEvil Any%

The “official” MediEvil Any% history basically starts halfway through the story, which is why my dataset looks so weird.

If you’d rather watch than read, Pap made a great documentary, The History of MediEvil Speedruns, that covers this story in full. You can watch that, skim this section, or skip ahead to the machine-learning part:

Speedrunning MediEvil starts in 2006 on Speed Demos Archive, when a runner called **Edeshi** posts a one-hour run under old timing rules. From what we can reconstruct it’s basically “intended route, but fast”: all 21 levels, a few safety detours, no game-breaking glitches. For years, that ghost run and a handful of forum posts are the entire scene.

The game only really wakes up when two things happen:

1.  **A theory guy shows up.** A player called **groobo** starts dumping strategies and weird tricks into the forums: sequence breaks, wall clips, odd physics interactions. There are no videos, just text, but the knowledge is way ahead of what anyone is actually running.
2.  **A TASer decides to go all-in.** In 2010, **Torn338** starts working on the first tool-assisted MediEvil speedrun. Using savestates and frame advance, he builds a “perfect” route that chains together groobo’s ideas and his discoveries. This is where MediEvil’s identity as a broken speedgame is born.

From that TAS era come the glitches that define the next decade:

- **Inventory glitch** – opening the inventory at just the right time partially freezes the game but not Dan’s physics.
- **Level looping** – falling through the kill plane with the inventory open and closing it later to respawn in “parallel” copies of the level, often right on top of the exit trigger.
- **Soldier despawn** – a nasty emulator-only trick that halves the final boss gauntlet.
- Plus a zoo of precise clips, out-of-bounds routes, and camera abuses that make MediEvil feel more like a physics sandbox than a PlayStation platformer.

I detailed all of the MediEvil Speedrunning glitches in the official MediEvil wiki, [Gallowpedia](https://medievil.wiki/w/MediEvil/Glitches), if you want to read more.

By 2011, Torn’s TAS stands at **43:10**, an absurd time compared to Edeshi’s hour-plus route. Crucially, the TAS is _not_ human-doable end-to-end: some tricks are too tight, and some setups depend on tool-level consistency. But it acts as a gravitational pull. From now on, every serious runner is chasing the ghost of 43:10.

Human RTA runs start to catch up around 2013–2015. **Crash41596**, **Cladall**, and **Brescaz** trade the world record back and forth, slowly incorporating more TAS tech. They accept a brutal deal: the run is absolutely packed with **run-ending tricks**—six level loops, finicky wall clips, death-if-you-miss jumps—but the times keep falling. Sub-50, then mid-40s.

And then **NoobKillerRoof** happens.

Between late 2014 and mid-2015, NKR basically speedruns the _skill ceiling_ itself. He doesn’t just adopt the existing tech; he refines it, adds more dangerous strategies (like “soldier despawn”, a glitch that halves the final boss gauntlet but only works on a specific emulator), and grinds until his consistency on absurd tricks is higher than most people’s consistency on basic movement. The record drops to **38:30** and then stalls. Other runners burn out; the run is simply too punishing. For a while, Any% is considered “solved enough”.

The story could have ended there. Instead, runners do what runners always do: they find a new way to break the game.

In 2020, Crash comes back with a vengeance and discovers **Dragon Gate Skip (DGS)** in Gallows Gauntlet: a wildly technical movement tech (a “knockback dash” with the club) that lets you bypass the fiery gate that used to require dragon armor. That sounds minor until you realize what the gate is actually gating.

With DGS, runners no longer need to:

- Get the dragon armor from Crystal Caves
- Which means they can ignore both dragon gems
- Which means they can ignore the entire eastern chunk of the game

**Six levels, including some of the hardest, disappear.** Any% loses about **15 minutes** in a single conceptual move.

The trick is so transformative that the community splits the category:

- **Any%** – the new, ultra-broken route that skips half the game.
- **Any% (No DGS**) – the “old” category that preserves the pre-DGS history.

This is the thing my dataset **does not show**: speedrun.com’s modern “Any% Emulator NTSC” records start _after_ DGS is already known and baked into the route. By the time the first dot shows up, the universe of possible times has already been violently compressed.

After DGS, the pattern repeats in miniature:

- **Jacoghosting** and **Smuggling** (2022) radically simplify two notorious run killers: Pools of the Ancient Dead and Gallows Gautlet with its infamous dragon gate.
- **Hilltop Mausoleum gate skip** (2023) removes a chunk of backtracking.
- **Gallows Gauntlet Skip (GGS)** (2024) stacks on top of DGS and route refinements to push the record even further.

Each of these doesn’t just shave seconds; it changes what a “good” time even means. A 38-minute Any% was godlike before DGS. After the dust settles, you’re not competitive unless you’re flirting with 21:xx.

Alongside the tech, the cast of characters rotates: Crash and groobo as early theorists and glitch hunters; Torn as TAS architect; Crash again as late-stage TAS author and DGS discoverer; NoobKillerRoof as long-term monarch of pretty much every category; and **Nazzareno**, **Londanomala**, and **JacoboTheChocobo** as the trio who push the post-DGS route to its current limits. Behind them is a long tail of runners whose PBs and experiments keep the game alive.

By the time my table begins in October 2020, almost everything that made the old route brutal is already history. My first row, that 32:57 from NKR, is **post-apocalypse** MediEvil: DGS is in play, many TAS ideas are mainstream, and people are starting to route around the new glitches’ side effects.

From that starting point, the record slides from 32:57 to 19:29 over four years. On paper, it looks like a reasonably smooth exponential decay; in social reality, it’s the shadow of fifteen years of **discontinuous knowledge shocks**:

- Edeshi’s linear, all-levels route
- The TAS revolution and level looping
- NKR’s 2010s reign at ~38 minutes
- Dragon Gate Skip annihilating six levels
- Jacoghosting, Smuggling, Hilltop skip, GGS refining the post-DGS world

The important takeaway for the rest of this essay is:

> The leaderboard we can export today is **already conditioned on multiple past revolutions.** Our models only see the _tail_ of a process that has been repeatedly reset by human discovery.

In other words, the dataset looks like “incremental progress with the occasional big jump.” The true history is closer to “years of nothing, then a glitch that deletes half the game.” That gap between what the data shows and what actually happened is exactly where machine-learning-style forecasting starts to fall apart—and it’s what we’ll dig into next.

## How Has the MediEvil World Record Moved Over Time?

Now that we’ve seen the long history, let’s zoom into the part we can actually measure.

The dataset I’m using here is **MediEvil Any% Emulator NTSC**, from late 2020 to late 2024. It starts well after the TAS era, after NKR’s 38-minute pre-DGS runs, and after Dragon Gate Skip has already been found and routed.

In other words: this is the post-apocalypse era. The game has already been broken in half. We’re just watching what happens after that.

For NoobKillerRoof, I also have private data: every attempt, not just his verified world records. For everyone else, we’re stuck with what the leaderboard shows.

### The Visible Curve

If you plot the world record over time, you get this:

![Machine learning medievil wr analysis](https://i0.wp.com/buthonestly.io/wp-content/uploads/2025/12/machine-learning-medievil-wr-analysis.jpg?resize=830%2C410&quality=81&ssl=1)

On 14 October 2020, NoobKillerRoof submits a **32:57**.  
That same day he drops it to 27:48, then 26:27, then **25:37**.

The first improvement alone is **−5:09 (309 seconds)**. The whole evening is a seven-minute freefall. In speedrunning terms, that’s absurd.

After that first frenzy, the progression looks almost sensible:

- February 2021: 24:51
- August 2021: 23:40
- May–November 2022: a chain of records ending at 21:13
- 2023–2024: small cuts down to **today’s 19:29**

Across 20 world records, we go from 32:57 → 19:29 in just over four years.

You can even summarize it like this:

| Date       | WR Time |
| ---------- | ------- |
| 2020-10-14 | 32:57   |
| 2021-02-11 | 24:51   |
| 2022-11-07 | 21:13   |
| 2024-11-04 | 19:29   |

If you only look at the line, it’s tempting to see a simple story of smooth refinement: big early gains, then smaller and smaller improvements as we approach some invisible skill limit.

But that reading quietly erases everything we just learned from the history.

### The Hidden Structure: Discoveries Already Baked In

On the WR plot, I’ve drawn a few vertical dashed lines: the dates of major skips that matter for this period:

| Skip                        | Date / Range    |
| --------------------------- | --------------- |
| Dragon Gate Skip (DGS)      | 2020-07-20      |
| Jacoghosting                | 2022-04-26      |
| Smuggling                   | 2022-04–2022-08 |
| Hilltop Mausoleum gate skip | 2023-07-15      |
| Gallows Gauntlet Skip (GGS) | 2024-07-17      |

DGS is the important one to keep in mind. By the time we see that first 32:57 in October 2020, the skip that removed six whole levels is already standard. The 15-minute route revolution never appears in this dataset. It’s just a faint dashed line somewhere off to the left of the first record.

Same for the earlier tools: level looping, the old Haunted Ruins and Ghost Ship loops, soldier despawn, the 2010s optimisations that dragged MediEvil into the 38-minute range. None of that shows up in our table.

As far as my dataset is concerned, the universe begins in 2020, with NKR idling around 33 minutes on a route that is already the result of fifteen years of glitch hunting.

That matters, because:

- Our models only ever see the tail end of a much wilder process.
- From the data’s point of view, DGS isn’t a discovery. It’s a law of nature.

### Jumps That Still Look Like Noise

Even _inside_ this already-broken era, the line is not as smooth as it looks.

If we walk through the records row by row, that first night has a −5:09 drop, then −1:21, then −0:50 in quick succession. Later we get regular −20 to −30 second cuts as new tech like Jacoghosting and Smuggling filters into real runs. By 2023–2024, most improvements are tiny: −15s, −11s, −6s, −5s—the kind of changes you’d expect from pure execution grind or minor route tweaks.

The dashed lines help decode these jumps:

- Jacoghosting and Smuggling sit right before a cluster of 20–30s drops in 2022.
- Hilltop skip appears before the push from high-21 to low-20 in 2023.
- GGS lines up with the final slide from just over 20 minutes to sub-19:30 in 2024.

To a human who knows the game, the pattern is obvious: there’s a background process of “play better, die less, route smarter” that shaves off seconds, and on top of that a handful of knowledge shocks—new skips—that suddenly make it realistic to save 20, 30, or 60 seconds at once.

To a model that only sees timestamps and times, all of this collapses into jagged noise:

- 6 seconds here,
- 28 seconds there,
- occasionally 309 seconds on a weird day back in 2020.

A time-series forecaster has no way to know that _this_ 30-second jump is different in kind, not just in size. It doesn’t know about DGS or Jacoghosting or the moment someone types “wait, what if we open the inventory here?” in Discord.

All it sees is a curve with fat residuals.

### Where We’re Going With This

This is why I wanted to start with the raw progression before touching models.

It gives us a concrete object to work with—dates, times, deltas—and it already shows a mix of smooth grinds and sudden drops, even in this compressed, post-DGS era. But it also hides the most important facts behind the scenes: _how_ those drops came to be.

In the next step, we’ll formalise that intuition:

- What does a “normal” improvement look like if we ignore the outliers?
- How far could we reasonably extrapolate just from those?
- And how badly do those predictions fail the moment a new skip appears?

To answer that, we’re going to look directly at the distribution of WR deltas and separate “everyday grind” from “something weird just happened.”

## What Does “Normal” Progress Look Like?

Once you get past the fireworks of Dragon Gate Skip and the early post-apocalypse chaos, MediEvil’s world record improvements are… surprisingly modest.

I took the world-record progression we just looked at and stripped out the two monster jumps: the −5:09 evening and the other >1-minute cut. What’s left is the everyday work of speedrunning: the gains you get from grinding, tightening movement, and actually learning to play the route you already know.

On that trimmed set of WR updates, the numbers look like this:

| Metric                     | Value (seconds) | Value (mm:ss) |
| -------------------------- | --------------- | ------------- |
| Median improvement         | 17              | 00:17         |
| Mean improvement           | 23              | 00:23         |
| 25th percentile (Q1)       | 12              | 00:12         |
| 75th percentile (Q3)       | 30              | 00:30         |
| Max “normal” improvement\* | 71              | 01:11         |

\*After removing the huge early DGS-era jump.

If you plot those sizes as a histogram, you don’t see anything exotic.

![Machine learning medievil wr normal progression](https://i0.wp.com/buthonestly.io/wp-content/uploads/2025/12/machine-learning-medievil-wr-normal-progression.jpg?resize=829%2C397&quality=81&ssl=1)

- A “typical” new world record is about **17 seconds faster** than the previous one.
- Half of all records improve by **between ~12 and ~30 seconds**.
- Even in this cleaned-up world, you still occasionally get **big wins up to ~1:11**.

If you just stare at the histogram, nothing looks exotic. Most updates sit in the 10–30 second range. A few are tiny (<10 seconds). A handful are chunky 30–70 second leaps. It’s exactly what you’d expect from the narrative in Pap’s documentary:

- Once a major skip exists and has been routed, runners need time to absorb it.
- The first WR that fully commits to a new piece of tech might be a 40–70 second jump.
- After that, everyone goes back to shaving off tens of seconds at a time.

From the runner’s point of view, those improvements represent years of life: learning super daggers, getting less terrified of Haunted Ruins loops, pushing Dragon Gate setups from “run killer” to “usually fine.” Every extra 10–20 seconds off the record is a long grind of failed attempts and bad splits.

From the outside—especially to an algorithm reading a CSV—all of that collapses into a simple pattern:

> Most of the time, a new WR is just the old WR minus about twenty seconds, give or take.

That’s exactly the kind of regularity machine learning loves.

If all you see is a smooth-ish curve plus a noise distribution like this, it feels very natural to believe you can forecast the future:

- Fit a curve through the past record times.
- Assume each new record subtracts a random value drawn from this 10–30-second-ish range.
- Roll the process forward and you get a neat prediction of where the record “should” be next year, and what the eventual limit might be.

And that’s the trap we’re walking toward.

All of these “normal” improvements live **inside a fixed universe of tricks**.  
They assume Dragon Gate Skip exists, but not Gallows Gauntlet Skip.  
They assume Jacoghosting is known, but not whatever glitch someone finds next year.

In the next section, we’re going to deliberately build one of these naïve models—a polite little forecasting machine that knows about the grind but knows nothing about future discoveries—and see what it thinks the future of MediEvil should look like.

Then we’ll compare that fantasy to what actually happened when new skips landed.

## When a Polite Model Tries to Predict MediEvil

We’ve looked at the curve and the “normal” step sizes. Now let’s do the obvious, slightly cursed thing:

Pretend we’re an algorithm.

We’ll ignore all the human context, just take the numbers, and ask:

> “Given what you’ve seen so far, what should happen next?”

I tried two polite little approaches you’d see in a [[neural-network-predict-resin-usage-3d-printed-miniatures|basic notebook]]:

1.  Fit a smooth curve directly to the world-record history.
2.  Simulate an alternate universe where progress is _only_ “normal” grind—no new skips.

Both approaches behave exactly the way you’d expect a model to behave. That’s the problem.

### Curve Fitting: “You’re basically done”

First, I took the post-DGS WR history (those 20 records from 32:57 down to 19:29) and fit two simple models:

- A **linear** trend: time as a straight line over date.
- An **exponential** decay: times drop fast at first, then flatten toward a limit.

The linear model goes completely off the rails. It’s dominated by the early, steep drops in 2020 and happily extrapolates that slope forward. By the time you reach late 2024, it’s predicting something like **39,709 minutes** for the “WR” — almost a month of gameplay. Obviously nonsense.

The exponential model is much more polite. It does what you’d expect a “learning curve” to do:

- It fits a nice decaying curve through the past WRs.
- It predicts a slightly slower WR “today”.
- It suggests a plausible lower bound we’ll never quite reach.

Here’s what those numbers look like:

|                      | Time  |
| -------------------- | ----- |
| Actual WR (Nov 2024) | 19:29 |
| Exp model “today” WR | 19:51 |
| Exp model’s limit    | 19:12 |

So the exponential fit is saying:

- “Given this history, you’re currently a bit _ahead_ of where I’d expect you to be (19:29 vs 19:51).”
- “In the long run, you might shave off another ~**40 seconds** at best, converging somewhere around **19:12**.”

If you’ve ever seen “AI predicts the human limit of X” charts, this is exactly the move: treat history as a smooth process, assume diminishing returns, and read off an asymptote.

On the face of it, this doesn’t look crazy. The curve hugs the points. The residuals look reasonable. The confidence intervals are neat. There’s nothing in the **shape** of the WR line to warn the model that it’s about to be blindsided.

The catch is that this line is already missing the most important part of the story: all the discoveries that happened _before_ our dataset starts, and all the discoveries that will happen _after_ it ends.

To really see that, we need a different vantage point.

### A Grind-Only Universe: “You should still be at 28 minutes”

The second approach is to ask a different question:

> “If all we had was normal grind, how far could we reasonably have gotten?”

Instead of treating the WR times as a smooth curve, we treat the **WR improvements themselves** as a random process: each new record subtracts a “step” drawn from the distribution we saw earlier, mostly 10–30 seconds, occasionally up to ~1 minute.

Then we simulate an alternate universe:

- Start from NKR’s first post-DGS WR, **32:57** on 14 October 2020.
- Assume Dragon Gate Skip already exists, but **no new skips are ever discovered after that**.
- Let a synthetic runner keep grinding, with “normal” WR-sized improvements drawn from that 10–30-second-ish distribution.
- Fast-forward three years to 14 October 2023 (roughly when the real route is already in the low 20s).
- Record what the _best_ time this simulated world manages to hit is.

Run that simulation many times, and you get a distribution of “final WR times” in a grind-only universe:

| Scenario (Oct 2020 → Oct 2023) | Final time (seconds) | Final time (mm:ss) |
| ------------------------------ | -------------------- | ------------------ |
| Median simulated WR            | 1,674                | 27:54              |
| Best 10% (p10)                 | 1,532                | 25:32              |
| Worst 10% (p90)                | 1,789                | 29:49              |

In plain language:

- If you replay the post-DGS era **without** any new skips, a typical world record ends up around **27–28 minutes**.
- In the best 10% of simulated worlds, you might scrape down to **25:32** or so.
- In the worst 10%, you’re still stuck near half an hour.

But in the _real_ world, by late 2023, we’re already flirting with **20 minutes** and then **sub-20**.

That gap—roughly **five to eight minutes of extra improvement** that the grind-only model can’t explain—is exactly the contribution of later discoveries like Jacoghosting, Smuggling, Hilltop gate skip, and GGS. It’s the part of the curve that doesn’t come from “people playing better”; it comes from “people realising the game is even more broken than we thought.”

And notice what the grind-only simulation does well:

- It captures the _scale_ of normal improvements.
- It produces realistic, lumpy progress with occasional big but not insane jumps.
- It gives you a plausible range for “where we should be” if the rules had stayed the same.

What it cannot do, by construction, is produce the actual timeline we observe—because the real timeline includes events that are literally outside its model of the world.

### Where This Leaves Our Polite Model

At this point we’ve built the kind of thing you’d see in a very respectable “AI predicts the future of X” blog post:

- A neat learning-curve fit with a limit near 19 minutes.
- A grind-only simulation that says “you shouldn’t be much faster than ~26–28 minutes by now.”

Both are internally consistent. Both are reasonable extrapolations _if the process stays the same_.

Both are also fundamentally wrong about what actually happened, because the process didn’t stay the same. People found new skips.

In the next section, we’re going to stop being polite to the model and explicitly measure what those discoveries did: how much time each skip carved out of the record, and how that compares to the “normal” 10–30 second updates our model is so comfortable with.

## When Discoveries Punch Through the Curve

So far we’ve treated world records as if they were all the same kind of event: someone played a bit better, made fewer mistakes, routed a bit smarter, and shaved off 10–30 seconds.

But in MediEvil (and most serious speedruns), some records are fundamentally different. They’re not “I executed the route better,” they’re “the route is now a different thing.”

To make that distinction concrete, I looked at four major discoveries in the post-DGS era:

- **Jacoghosting**
- **Smuggling**
- **Hilltop Mausoleum gate skip**
- **Gallows Gauntlet Skip (GGS)**

and asked: _how much world-record time did each of these actually erase?_

There are two useful ways to measure that.

### Two Ways of Measuring a Skip’s Impact

1.  **Before/after window**
    - Take a one-year window _before_ and a one-year window _after_ a skip’s discovery date.
    - Compare the **best** WR in the “before” window to the **best** in the “after” window.
    - This is conservative: it gives runners some time to adopt and polish the tech.
2.  **Label-gap jump**
    - Find the **first** WR that uses the new skip.
    - Look back to the **last** WR that definitely did _not_ use it.
    - Take the difference.
    - This is more aggressive: it captures the actual “ledge” on the WR line at the moment someone first commits to the new route.

Using those two lenses, we get this:

| Skip                        | Method       | Time saved (seconds) | Time saved (mm:ss) |
| --------------------------- | ------------ | -------------------- | ------------------ |
| Jacoghosting                | Before/after | 104                  | 01:44              |
| Jacoghosting                | Label gap    | 251                  | 04:11              |
| Smuggling                   | Before/after | 104                  | 01:44              |
| Smuggling                   | Label gap    | 251                  | 04:11              |
| Hilltop Mausoleum gate skip | Before/after | 45                   | 00:45              |
| Hilltop Mausoleum gate skip | Label gap    | 89                   | 01:29              |
| Gallows Gauntlet Skip (GGS) | Before/after | 38                   | 00:38              |
| Gallows Gauntlet Skip (GGS) | Label gap    | 38                   | 00:38              |

A few things jump out immediately:

- Jacoghosting and Smuggling together look like a whole **late-game level** vanishing. Even with the conservative before/after window, you get ~**1:44**. Looking at the label-gap, the first “full send” route is more than **four minutes** faster than the last no-tech WR in the same era.
- Hilltop gate skip is “small” only by comparison. A **45–89 second** gain from a single trick would be a career-defining find in most games.
- GGS is the tiniest of the bunch and it still removes **38 seconds**, which is more than double the median WR improvement we saw earlier.

Compare those to our “normal” WR step sizes:

- Typical WR improvement (median): **17 seconds**
- 25–75% band: **12–30 seconds**
- “Normal” max (trimmed): **1:11**

Even in the **conservative** view, every one of these skips is at least a **2–3× outlier** relative to normal improvements. In the label-gap view, Jacoghosting + Smuggling is **10×** a typical record.

To a human who knows the game, that’s exactly what it feels like:

- Before the skip, you’re fighting for 20-second cuts by playing out of your mind.
- After the skip, people casually save 90+ seconds by learning a single piece of tech.

To a model, none of this is special. The WR line is just a sequence of numbers going down with some noise. A 251-second jump looks like “one very spicy sample from a fat-tailed distribution.”

If you’re fitting a smooth curve, the usual move is to treat those points as outliers:  
clip them, downweight them, or quietly throw them away so the regression behaves.

But in speedrunning, those “outliers” are the entire point.

They’re not mistakes. They’re the moments when someone discovers the rules have changed.

### Why the Model Never Sees it Coming

Notice what neither of our polite models knows:

- The exponential WR fit has **no concept** of “this point used a new glitch.” It just sees a dot and tries to hug it.
- The grind-only simulation has **no mechanism** for “sudden, structural improvement.” Its universe literally forbids Jacoghosting, Smuggling, Hilltop, GGS from ever existing.
- Both assume that whatever generated the past will keep generating the future in roughly the same way.

In statistics terms, they treat the process as stationary with some noise.  
In human terms, they assume nobody is going to wake up tomorrow and find a way to delete another minute.

Speedrunning gives us the luxury of quantifying how wrong that assumption is. We can point to a specific date and say:

> “On this day, a human idea moved the world record by more than a minute. No model trained on the previous curve could have predicted that idea in advance.”

That’s not a limitation of _this_ model or _this_ dataset. It’s structural. Anything that only sees:

- public WR times,
- and a distribution of past step sizes,

is blind by design to:

- the next skip,
- the next glitch,
- the next “oh wait, the game is more broken than we thought.”

In the next part of the essay, we’ll zoom in even further and look at what the leaderboard hides about how these records are actually made: not just the public points on the line, but the thousands of failed attempts underneath, and the runners grinding toward a future the model can’t see.

That’s where the real mismatch between “AI predictions” and lived reality shows up.

## What the Leaderboard Hides

So far we’ve only looked at what the leaderboard shows you: a clean sequence of world records, gently stepping down over time with a few dramatic drops.

But that line is the thinnest possible summary of what actually happened.

Thanks to private data from a few runners, we can zoom in on the thing leaderboards never show: the grind underneath.

For NoobKillerRoof, we don’t just have his world records. We have **every attempt** over almost seven years: every reset, every completed run, every time he died in Gallows Gauntlet and hit “New Game” again.

Here’s what that looks like in aggregate.

### NKR’s Grind, by the Numbers

For the main MediEvil Any% Emulator NTSC category, NKR’s raw stats look like this:

| Metric                     | Value      |
| -------------------------- | ---------- |
| Attempts                   | 5,470      |
| Completed runs             | 507        |
| Resets                     | 4,963      |
| Reset rate                 | 91%        |
| Best time (PB)             | 19:29      |
| Span of grind              | ~6.7 years |
| Median attempts per new PB | 21         |
| % of runs within 10s of PB | 0.4%       |
| % of runs within 30s of PB | 1.4%       |
| % of runs within 60s of PB | 11.2%      |

A few things to notice:

- More than **nine out of ten attempts** die before the credits.
- Only about **one in ten runs** finishes within a minute of his personal best.
- Runs that are truly “on pace” are statistical freaks: fewer than **1%** of attempts end within 10 seconds of PB.

On the public graph, each new world record is just a dot and a time stamp.

From this angle, a new PB looks more like a rare event in a sea of failure—a tiny cluster of points way out in the tail of a very lumpy distribution. Most of the work goes into runs that never show up on speedrun.com at all.

### Not All Grinders Are the Same

We also have smaller attempt datasets for two other runners:

- **Thefoxy1978** – a less-optimised PB, lots of variance.
- **LeonMauriceMan** – much more tightly clustered performance.

In the same category, their stats look like this:

| Runner | Attempts | Completed | Reset rate | PB    | σ of completed runs (s) | % within 60s of PB |
| ------ | -------- | --------- | ---------- | ----- | ----------------------- | ------------------ |
| NKR    | 5,470    | 507       | 91%        | 19:29 | 224                     | 11%                |
| Foxy   | 351      | 10        | 97%        | 24:27 | 1,564                   | 20%                |
| Leon   | 537      | 35        | 93%        | 20:47 | 45                      | 49%                |

You don’t need to stare too hard at that table to see three completely different “shapes” of runner:

- **NKR** lives in the extremes.
  - Massive sample size, high reset rate, huge spread, very strong PB.
  - Most completed runs are _nowhere near_ his best; he is constantly pushing against the edge of what the route allows.
- **Thefoxy1978** has a weaker PB and enormous variance.
  - When he does finish, his times are spread out across a wide range.
  - He looks like a runner who’s exploring the category rather than living at its absolute limit yet.
- **LeonMauriceMan** is weirdly consistent.
  - A much tighter spread (σ ≈ 45 seconds), nearly half of his completed runs end within a minute of PB.
  - He looks like someone who has stabilised execution but hasn’t (yet) pushed into the same extreme-risk territory as NKR.

On the leaderboard, all three are numbers in a column: 19:29, 24:27, 20:47. Maybe you notice that NKR is “faster” and Foxy is “slower.” You don’t see:

- how many runs each PB is sitting on top of,
- how much variance that runner lives with,
- how “repeatable” their best times are,
- or how their progression actually felt from the inside.

This is exactly the kind of information a typical forecasting model never sees. The model gets the **frontier**—the best-known times at each point—and maybe some public PBs. It doesn’t get:

- the thousands of failed attempts,
- the runs that almost PB’d and died to one trick,
- the days where nothing finishes at all.

From the outside, NKR’s improvement from 32:57 to 19:29 looks like a smooth, shrinking staircase. From the inside, it looks like 5,000+ attempts, a 91% reset rate, and long plateaus where nothing moves until suddenly it does.

In the next section, we’re going to do something deliberately unfair to our polite little models: ask them to **predict the next world record** based only on the public curves, and see which runner they think should be “favoured” for the crown.

Then we’ll compare those paper futures to the messy reality we just saw here.

## When “AI” Predicts the Next World Record

So far we’ve been polite to the models: we let them fit the overall WR curve, and we let them live in a grind-only universe where nothing truly weird ever happens.

Now let’s ask a more pointed question:

> **If you only look at the curves, who should get the next world record—and how fast will it be?**

I played this game in two flavours:

- **PB-only models** – one smooth curve per runner, using only their _public_ personal-best history.
- **WR race models** – put those curves into a simple “race” against the current world record and see who crosses it first.

All of these models are deliberately blind. They see:

- dates and times of **public PBs** for each runner,
- dates and times of **world records**,

and nothing about:

- private grind,
- hidden near-misses,
- or future discoveries.

Then, for one runner—NoobKillerRoof—we break that rule and let the model see everything.

### PB-Only Models: Neat Curves, Weird Stories

First, I took the public Any% Emulator NTSC PB history for three runners:

- **NoobKillerRoof** – the long-term WR holder.
- **Nazzareno** – historic #2.
- **BlackMenthol** – historic #3.

For each runner, I fit a simple exponential curve to their own PBs:

- It starts at their first recorded PB.
- It decays downwards with diminishing returns.
- It has an asymptote: “your personal limit, if you grind forever.”

Then I asked: **“What’s your next PB, and what’s your limit?”**

| Runner         | Model “next PB” | Model asymptote | Interpretation                              |
| -------------- | --------------- | --------------- | ------------------------------------------- |
| NoobKillerRoof | 19:53           | 19:37           | Model thinks he’s already _past_ his limit. |
| Nazzareno      | 20:20           | 20:20           | Curve flattens right at his current PB.     |
| BlackMenthol   | 20:30           | 20:23           | Maybe a small improvement, then a plateau.  |

These are **PB-only** models. Each one assumes:

- “This runner will keep improving along the same smooth curve they’ve shown so far.”
- “Big gains early, then small ones, then flat.”

From that perspective, the story is pretty tidy:

- For **NKR**, the model thinks he’s basically _done_. His asymptote is **slower** than his actual PB; on paper he shouldn’t even be this fast.
- **Nazzareno** looks capped; the curve says his next PB should be roughly where he already is.
- **BlackMenthol** has a bit of room to grow, but not much.

![Screenshot of speedrunner NoobKillerRoof finishing a MediEvil Any% emulator run in 19:29, showing detailed splits on the left, a controller overlay, and the in-game dragon boss exploding as Twitch chat reacts to the new world record.](https://i0.wp.com/buthonestly.io/wp-content/uploads/2025/12/noobkillerroof-medievil-worldrecord.jpg?resize=829%2C465&quality=81&ssl=1 "NoobKillerRoof setting the current MediEvil Any% world record.")

This is the classic “learning curve” move: compress years of grind into a neat little exponential and pretend the future will politely follow it.

The problem, of course, is that none of these curves know about **new skips**, or other players’ breakthroughs, or what happens when someone deletes another minute from the route. They’re trying to predict a moving target on a treadmill.

### Add the Grind, And the Picture Explodes

Now we take just one of those runners—**NoobKillerRoof**—and give the model information it almost never has in the wild: **every single attempt**.

From his full logs we know:

- 5,470 attempts on the category
- 507 completed runs
- a **91%** reset rate
- a current PB / WR of **19:29**

Instead of fitting a smooth PB curve, we look at:

- how big his PB improvements usually are, and
- how many attempts he typically needs between PBs.

Then we simulate “just one more PB” using those actual grind patterns: draw a plausible PB improvement from his historical distribution, draw a plausible number of attempts until it happens, and repeat this many times.

That grind-based simulation says something very different from the PB-only curve:

- The **median** next PB is around **19:21**.
- In the best 10% of futures, he might jump to about **18:47**.
- In the worst 10%, he barely improves at all and stays around **19:29**.

On timing:

- The **median** next PB lands just a couple of days after his last one (assuming he keeps running the category, which we know he didn’t).
- Even in the slower scenarios, it usually arrives within a few weeks.

Compare that to the PB-only exponential model, which:

- wants his next PB way out in January, and
- barely faster (or even slower) than what he already has.

Two models, same player, same underlying reality:

- One, trained only on PBs, thinks: _“Tiny changes, months apart, almost at the limit.”_
- One, trained on actual attempts, says: _“There’s still real room here, and the next step could be big and soon—or never, if he stops grinding.”_

Neither model knows anything about future skips.  
Neither model knows whether NKR gets bored and moves to another game.  
Neither model knows what’s going on in Discord.

But even **before** we talk about discoveries, just switching from “PB-only” to “true grind” makes the future blurrier and more asymmetric. The PB-only world is falsely neat.

### Predicting the Next World Record

Now we do the thing every leaderboard nerd secretly wants to do:

> **“Who’s going to get the next WR, and how fast will it be?”**

We take the PB-only curves for **NKR**, **Nazzareno**, and **BlackMenthol** and extrapolate them a couple of years into the future. Then we compare each curve to the current WR, NKR’s **19:29**.

Depending on which flavour of “reasonable” you pick, you get entirely different answers:

- A **linear trend on all PBs** says everyone will keep improving at their historical average pace.
  - That produces absurd futures where NKR’s line slides toward something like **14:12** if you extrapolate far enough, and Nazzzareno / BlackMenthol also cruise toward mid-14s or 15s.
  - In that universe, the current 19:29 WR looks like just one step on a very tall staircase.
- An **exponential “learning curve”** on the same PBs tells almost the opposite story.
  - No one’s curve crosses below **19:29** in the next couple of years.
  - NKR is already at or past his personal asymptote.
  - Nazzareno and BlackMenthol flatten _above_ the current WR.
  - In that universe, the record is effectively unbeatable. We’re done.
- A **“recent PBs only” linear model** splits the difference.
  - It thinks NKR might chip a second or two off by late 2024 (which, as of December 2025, didn’t happen).
  - Nazzareno and BlackMenthol inch closer.
  - If you wait long enough, someone might drift toward an **18:xx**, but it looks more like erosion than revelation.

Three modelling choices, three incompatible futures:

- _Sub-15 is inevitable._
- _Nothing beats 19:29._
- _Maybe we get an 18-something if everyone keeps grinding._

All of them are backed by clean math on the same public data.  
All of them are wrong for the same structural reason:

> They assume tomorrow is drawn from the same process as yesterday.

None of them has a slot in the equation for:

- “someone finds a simpler Dragon Gate setup,”
- “someone discovers one more level loop and turns a full loop into a half loop,”
- “someone routes a new skip that deletes 45 seconds,”
- or, very simply, “NKR stops playing; Nazzareno focuses on Max%; BlackMenthol picks up a new game.”

The PB-only models see three smooth lines inching toward a limit.  
The grind-based simulation sees a messy, lumpy, high-variance process.  
The actual history of MediEvil sees **phase changes**: DGS, Jacoghosting, Smuggling, Hilltop skip, GGS.

And the next big shift—the one that really moves the world record—is far more likely to look like another phase change than like one more polite extrapolation step.

## AI Is Not an Oracle

At this point, we’ve done everything you’re “supposed” to do with data:

- Plotted the world records.
- Measured normal improvement steps.
- Fit smooth curves.
- Simulated grind-only futures.
- Quantified the impact of individual discoveries.
- Built little models to predict who “should” get the next world record.

None of those moves were fake. They all told us something real.

- The WR curve _is_ mostly made of 10–30 second improvements.
- Exponential fits _do_ roughly track how a single runner’s PBs improve.
- Grind-only simulations _do_ capture the background progress you get from simply playing more.

But every time we zoomed out, the same pattern showed up:

> The biggest shifts in MediEvil Any% aren’t grind. They’re **discoveries**.

Dragon Gate Skip deleting six levels. Jacoghosting and Smuggling carving minutes out of the late game. Hilltop gate skip and GGS slicing another handful of seconds off the top.

No model trained only on the _curve_ ever saw those coming.  
They couldn’t. The information wasn’t in the data.

### Three Layers the Model Never Sees

It helps to think about the whole system in layers.

- **Layer 1: The public curve.** This is what speedrun.com gives you: a neat line of world records and public PBs. It’s the only thing most models ever touch.
- **Layer 2: The hidden grind.** Thousands of attempts, resets, near-misses, local PBs, abandoned runs. For NKR, that’s 5,000+ attempts and a 91% reset rate under a single 19:29. You almost never get this data in the wild.
- **Layer 3: The future discoveries.** New skips, glitches, routes, tools. The ideas that make Dragon Gate Skip, Jacoghosting, Smuggling, Hilltop, GGS possible. By definition, they’re not in your training set yet.

Most machine-learning forecasts in the real world only ever see **Layer 1**. Sometimes, if you’re lucky, they see a censored version of **Layer 2**.

They almost never see **Layer 3** in advance, because the next discovery simply hasn’t happened yet.

In MediEvil, we can see all three:

- Layer 1: the WR graph we’ve been plotting.
- Layer 2: the private datasets for runners like NKR, Foxy, and LeonMauriceMan.
- Layer 3: Pap’s documentary, the glitch-hunting Discord, the forum posts where someone types “wait, what if we open the inventory here?” and breaks another level.

Speedrunning is honest about this structure. Runners know that the scariest thing isn’t “someone with slightly better execution.” It’s:

> “Someone who realises the game is more broken than we thought.”

That’s the part the curves can’t see.  
And it’s the part that decides where the line ends up.

### Beyond MediEvil: Unknown Skips in the Real World

MediEvil is a toy universe, but the pattern isn’t.

Everywhere people point machine learning at a curve and ask “what happens next?”, you get some version of the same setup:

- In **finance**, models see past prices and volumes (Layer 1), occasionally some order-book info (Layer 2), but not the next regulation change, fraud case, or geopolitical shock (Layer 3).
- In **product and growth**, dashboards show signups, activation rates, retention (Layer 1), and maybe some user-level funnels (Layer 2), but not the next platform policy change, viral loop, or competitor move (Layer 3).
- In **science**, models see published measurements (Layer 1) and sometimes raw experimental logs (Layer 2), but not the next conceptual leap that changes what you even measure (Layer 3).

Most of the time, this isn’t a disaster. If all you need is “roughly how many users will we have in 3 months if nothing changes?”, a grind-only model is genuinely useful. It gives you baselines, warning bands, and sanity checks.

But trouble starts when we mistake that usefulness for **omniscience**.

When we start talking about “AI predicting the future of X” as if:

- the rules of the game are fixed,
- no new skips will be found,
- and the curve we’ve seen so far is the same curve we’ll get forever.

Speedrunning gives us a clean way to see why that’s wrong:

- The model’s forecast of “where WR _should_ be” under pure grind (mid–20s) is off by **five to eight minutes** once new skips land.
- “Reasonable” extrapolations from PB curves say either “sub-15 is inevitable” or “nothing beats 19:29” depending on which functional form you like.
- Neither story matches reality, because reality includes phase changes the models never modelled.

That doesn’t mean we throw the models away.  
It means we’re careful about what questions we let them answer, actually [[what-is-vibe-coding-how-to-do-it|collaborating with these tools]] instead of treating them like oracles.

They’re good at:

- “If nothing fundamental changes, what’s a plausible range for next month?”
- “How far off normal is this behaviour?”
- “Where are the plateaus and the obvious cliffs?”

They’re bad at:

- “What’s the next skip?”
- “When will someone have a new idea?”
- “How will the rules of this game change?”

Those questions live in Layer 3.  
You don’t get them from curve-fitting.  
You get them from people who are willing to break things.

### Thanks, and What Comes Next

None of this would have been possible without people who were willing to show their mess, not just their medals.

Huge thanks to **[NoobKillerRoof](https://www.speedrun.com/users/NoobKillerRoof)**, **[Thefoxy1978](https://www.speedrun.com/users/Thefoxy1978)**, and **[LeonMauriceMan](https://www.speedrun.com/users/LeonMauriceMan)** for sharing private attempts as well as public PBs; to **[Crash41596](https://www.speedrun.com/users/Crash41596)** for years of glitch-hunting and TAS work, and for his private splits which I ended up not using as they were for MediEvil 2019 and this essay is already long enough; and to all the runners who have submitted, routed, verified, and argued about their times in public where the rest of us can learn from them.

Thanks also to **Dan’s Friend** for maintaining such an [amazing wiki](https://medievil.wiki/) full of data and knowledge.

And a last thanks to **[Pap](https://www.youtube.com/@Papamanual)** for making _[The History of MediEvil Speedrunning](https://www.youtube.com/watch?v=bDcFlbygfxY)_ and stitching all of this into one coherent story instead of a pile of disconnected VODs and forum posts.

As for where MediEvil speedrunning goes next?

Right now, people are:

- searching for new level loops,
- trying to turn existing full loops into half loops,
- poking at all levels for just one more clip,
- and experimenting with ways to manipulate the final soldiers fight in Zarok’s Lair.

In other words: we’re still searching for skips we don’t even know exist yet.

Any curve we fit today is a guess about a world where none of that pans out. The real future—the one that matters—is hiding in the next discovery, the next glitch, the next line in a Discord chat that starts with “this is probably dumb, but…”

Machine learning can tell us a lot about how fast we’re sliding down the current route.  
It just can’t tell us when someone’s about to find a hole in the Dragon Gate.

That part is still on us.

If you wish to explore this amazing game, find more at [the dedicated website I created for it](https://medievil.org "MediEvil.org").
