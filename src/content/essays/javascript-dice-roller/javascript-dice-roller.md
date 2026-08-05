---
title: A JavaScript Dice Roller That Shows Its Work
date: 2026-09-01T02:00:00
updated:
sticky: false
cornerstone: false
excerpt: A fair dice roller and a rigged one produce numbers that look exactly the same. After a night of zombies that would not die, I built one that shows its work.
categories:
  - Programming
tags:
  - Creativity
  - Gaming
  - Workflow
cover: openfray-dice.jpg
coverAlt: An open palm held out toward the camera, with three white six-sided dice resting on the fingers.
coverCaption:
downloads:
audioVoice: Enceladus
audioStyle: reflective
audioPace: conversational
---

> [!summary]- Quick Summary
>
> - A fight that felt rigged left me unable to honestly tell my players they had only been unlucky, because I had no way of knowing whether that was true.
> - A tool that shows its work is still asking you to believe the work it shows is the work it did.
> - `@openfray/dice` is an open source JS library that takes a formula like `2d6+3` and returns the total plus the evidence: every die rolled, which ones counted, and each modifier listed separately rather than summed.
> - Fairness is not a setting. It uses `crypto.getRandomValues` rather than `Math.random`, removes modulo bias by rejection, draws once per die, and never nudges a result.
> - Much of the design is refusals — no division, no rules of its own, no line breaks inside a formula — each one handing a decision back to whoever should be making it.
>
> AI-generated summary based on the text of the article and checked by the author. [Read more](/artificial-intelligence-tools/ "BUT. Honestly Artificial Intelligence Tools") about how BUT. Honestly uses AI.

You cannot tell a fair dice roller from a rigged one by looking at the numbers.

My Dungeons & Dragons group is level four. They walked into a dungeon and found a room holding one Yuan-ti (a race of snake-people) and five zombies. The Yuan-ti was the threat. Zombies at level four are a speed bump.

Then I started rolling.

High rolls on my attacks, low rolls on theirs. High rolls too on undead fortitude, the trait that lets a zombie stay standing after a blow that should have finished it. My speed bump would not die. By the end of the fight it had killed one player, dropped two more to death's door, and left the last one upright on single digits.

It felt rigged.

And when we packed up, I could not tell my players otherwise. "You just got unlucky with the rolls" is the right thing to say only when it happens to be true, and I did not know whether it was. I had watched the same numbers they had. That was all either of us had.

That session was the last drop.

## Showing The Work Is Not The Same As Knowing

It was not the whole story. The app I used for rolling had been wearing on me for a while, in smaller ways that mostly had nothing to do with dice. Those belong in a post of their own. What that night added was distrust, and distrust was the one item on the list I could not fix by moving to a different app.

Not because I had found anything wrong. I had not looked.

That needs explaining, and the honest explanation is about me rather than the app. Investigating and building were both on the table. Building was the more interesting of the two, and with ADHD that is not a fair fight. [[tools-for-adhd-leadership|Novelty beats repetition]] and it wins before the deliberation is finished.

Reading somebody else's random number generator is repetition. Writing my own is novelty. So I wrote my own and left the question of whether I needed to for much later.

The app was not hiding anything, for what it is worth. It showed me its dice. Every roll broken out, every die listed, the arithmetic on screen. That was never the problem.

A tool that shows you its work is still asking you to believe that the work it shows is the work it did.

And even if I had satisfied myself about the tracker, I would have covered half the table. My rolls came out of it. My players' rolls did not. They roll in D&D Beyond, which I have no way of reading at all.

Two sources, then, and I could account for neither.

## What I Built Instead

So I wrote my own dice roller library.

It was meant to be its own library from the first commit rather than something I carved out later, and they went up on npm as [`@openfray/dice`](https://www.npmjs.com/package/@openfray/dice). Anybody can use it to roll dice in JavaScript or TypeScript, regardless if they are using it for D&D or something unrelated to games. Install it with:

```bash
npm install @openfray/dice
```

You write a formula as text. You get back a number, plus every die that produced it.

```ts
import { roll } from '@openfray/dice'

const result = roll('2d6+3')

result.total // 11
```

`total` is the number you usually want. Everything else on that object is there to explain how it got there.

```ts
result.dice[0].results // [5, 3]  — the two dice that were rolled
result.modifier        // 3       — the +3
result.formula         // '2d6+3' — what you asked for
```

Five, plus three, plus three. Eleven. Not a total with a shrug behind it — the arithmetic, laid out, ready to show someone.

### What You Can Roll

The simple cases look the way you would write them on a character sheet.

```ts
roll('1d20')   // one twenty-sided die
roll('3d8')    // three eight-sided dice, added together
roll('1d20+5') // one d20, plus 5
roll('2d6-1')  // two d6, minus 1
roll('1d78')   // unusual numbers of sides are fine, not just the usual ones
```

Past that, the formula language covers the things a table actually asks for:

| You write   | It means                                            |
| ----------- | --------------------------------------------------- |
| `2d6`       | Roll two six-sided dice and add them up.            |
| `1d20+7`    | Roll a d20 and add 7. Use `-7` to subtract.         |
| `1d8+1d4+3` | Mix as many dice and numbers as you like.           |
| `4d6kh3`    | Roll four d6, **k**eep the **h**ighest **3**.       |
| `4d6kl3`    | Same, but keep the **l**owest 3.                    |
| `1d20adv`   | Roll two d20 and keep the higher one. Advantage.    |
| `1d20dis`   | Roll two d20 and keep the lower one. Disadvantage.  |
| `1d6!`      | Exploding. Every top face rolls again.              |
| `1d6x10`    | Roll a d6, then multiply that group by 10.          |
| `2d10 fire` | A label on the end. Carried along, never math.      |

Spaces and capitals are ignored, so `2D6 + 3` works.

`4d6kh3` is there because it is how a generation of players rolled ability scores. `adv` and `dis` are there because Dungeons & Dragons asks for them constantly.

### Exploding Dice

Put a `!` after a die and it rolls again every time it lands on its highest face, adding as it goes. There is no ceiling.

```ts
roll('1d6!') // rolled 6, then 4      → results [6, 4],    total 10
roll('1d6!') // rolled 6, 6, then 2   → results [6, 6, 2], total 14
roll('1d6!') // rolled 3              → results [3],       total 3
```

Savage Worlds, Shadowrun and Deadlands all use some version of this, because it lets a small die produce a big number now and then. Every roll in the chain shows up in `results`, in order, so a 14 out of one d6 is something you can walk someone through.

### Multiplying A Group

Put `x` and a whole number after a die and that group's total is multiplied by it.

```ts
roll('1d6x10')   // a d6, times ten: 10, 20, 30, 40, 50 or 60
roll('2d6x3')    // both dice added up, then tripled
roll('1d6x10+5') // rolled 3 → 3 x 10 + 5 = 35
```

It multiplies **that group of dice**, never the whole sum — which is why the `+5` in the last line is added afterwards, untouched. It stacks with everything else, and always applies last:

```ts
roll('4d6kh3x2')  // keep the best three, then double them
roll('1d20advx2') // advantage, then double the die that won
roll('1d6!x2')    // let it explode, then double the whole chain
```

There are five other functions in the package, and most projects never touch any of them. `roll()` is the thing.

It is MIT licensed, has no dependencies, and runs in a browser or in Node 20 and up.

## Why The Dice Are Their Own Package

[OpenFray](https://openfray.app) is a combat console and initiative tracker for Dungeons & Dragons 5e. It holds initiative, creature resources and conditions on one screen, so a GM runs the encounter instead of remembering it. It works in a browser, needs no account, and every line of it is public.

Which makes it, unavoidably, the same kind of tool as the one that annoyed me into writing it.

The dice are what it rolls on. Every roll in the app goes through that one function, and getting there was the reason for writing them separately to begin with.

If randomness lives in one place, there is one place to check it. Scatter `Math.random()` across a codebase and you have as many sources of truth as you have call sites, each one a chance to do it slightly differently. Keep it behind a single `roll()` and the answer to "how does this app roll dice" is a file somebody can point at.

That was a scoping decision, not a rescue operation. OpenFray uses it the same way anyone else would.

Publishing the library made the whole thing stricter rather than looser. A package has a version, a README, a test suite, and an API that cannot quietly change shape because it suited me that week. Those constraints are there for whoever comes along later, and they happen to be the same constraints that make a thing checkable.

### MIT, While OpenFray Is AGPL

OpenFray is licensed AGPL-3.0. The dice are MIT.

The split is deliberate. The dice are not the product. They are plumbing, and plumbing is more use to people when there is nothing to weigh up before reusing it. Someone building a different tabletop tool, or a game, or a teaching example, should be able to take them without reading a license twice.

The app is a different matter and gets a different answer. I went through that choice at length in [[how-to-choose-a-software-license-for-your-next-project|a previous essay]]. It looks like a legal maze from outside, and mostly comes down to what you want to happen next.

## Showing The Work

The result object is built around one idea. A total should be reconstructable by somebody who does not trust the person who rolled it.

### The Die You Threw Away

Advantage means rolling two d20 and taking the higher. Most rollers hand you the higher one and move on.

```ts
const r = roll('1d20adv')

r.dice[0].results // [4, 17]  — both dice
r.dice[0].kept    // [17]     — the one that counted
```

The 4 is still there. It has to be, because "taking the higher" only means anything if you can see what was not taken. A 17 on its own is a number. A 4 and a 17 with the 17 circled is a decision you can check.

`keptFlags()` lines those up for display, so the dropped die can be greyed out rather than hidden:

```ts
keptFlags(r.dice[0]) // [false, true]
```

### Modifiers, Not Modifier

`modifier` is the sum of the flat numbers. `modifiers` is the list of them.

That looks like a redundancy until the numbers disagree. One effect adds 1, another takes away 6, and the sum is −5 — which tells you nothing about where either came from. The list lets you print `+1 −6` and let the reader do the arithmetic themselves.

A sum is an assertion. A list is evidence.

![OpenFray's game log filtered to rolls. A disadvantage check shows both d20s, 8 and 3, resolving to 3. An advantage attack shows 1 and 18, resolving to 18. A strength check lists its modifiers as +1 and -6 rather than as a single -5.](roll-log.jpg 'Both of the rules above, running in OpenFray. The die that lost is still printed next to the one that won, and the exhaustion penalty sits beside the bonus instead of being folded into it.')

### What The Die Showed

Every group reports whether the die it kept landed on its highest or lowest face.

```ts
roll('1d20').dice[0].naturalHigh // true if the d20 came up 20
roll('1d20').dice[0].naturalLow  // true if it came up 1
```

Both are `false` unless the group kept exactly one die, because a 6 among four dice is not the result of anything by itself.

That is all they report — what the die showed. Whether a natural 20 is special, and what happens if it is, the library has no opinion about.

None of this makes the dice fairer. It makes them answerable, which is a different property and the one I was missing.

## The Rest Of The Surface

`roll()` is the whole library for most projects. Five other functions sit beside it, each one there because something in OpenFray needed it.

| Function                    | What it does                                                     |
| --------------------------- | ---------------------------------------------------------------- |
| `roll(formula, options?)`   | Rolls a formula and returns the result. Start here.              |
| `parseFormula(text, opts?)` | Reads a formula **without rolling it**. For checking user input. |
| `rollDie(sides, source?)`   | Rolls one die. No formula, no parsing.                           |
| `cryptoRandom()`            | The raw random number the dice are built on.                     |
| `keptFlags(group)`          | Marks which dice counted, for greying out the rest.              |
| `soleDieGroup(result)`      | Finds the dice in a result, if it used only one kind.            |

### Checking A Formula Without Rolling It

`parseFormula()` reads a formula and tells you what it means, without throwing any dice. The usual job is validating something a person typed, so a bad formula fails where it was written rather than three screens later.

```ts
function isValid(text: string): boolean {
  try {
    parseFormula(text)
    return true
  } catch {
    return false
  }
}

isValid('2d6+3')    // true
isValid('two dice') // false
isValid('5')        // false — no dice in it
```

It hands back the formula broken into terms, which is also enough to show somebody what a formula will do before they commit to it.

```ts
parseFormula('2d6+3')
// terms: [
//   { kind: 'dice', sign: 1, count: 2, sides: 6 },
//   { kind: 'flat', value: 3 },
// ]
```

### Options

`roll()` takes a second argument, and everything in it is optional.

```ts
roll('1d20+7', {
  advantage: 'advantage', // or 'disadvantage'
  bonuses: [2, '1d4'],    // extra things to add
  tags: ['fire', 'cold'], // labels you accept
  rand: myRandomSource,   // your own randomness, for tests
})
```

**`advantage`** does the same job as writing `adv` into the formula. The formula version suits a fixed roll, the option suits one your code decides at run time. If several things in your project would each want to set it, work out the net result yourself and pass one answer. The library has no rules of its own to apply.

**`bonuses`** adds numbers or dice without building formula strings by hand. This is for the extras a program works out while it runs: a spell that adds `1d4`, a feature worth `+2`, whatever the table has going that round.

```ts
roll('1d20+7', { bonuses: [2, '1d4'] }) // rolls 1d20 + 7 + 2 + 1d4
```

**`tags`** is the list of labels you are willing to accept. A formula can end in a word — `2d10+8 fire` — and that word rides along with the result without ever touching the arithmetic.

```ts
roll('2d10+8 fire', { tags: ['fire', 'cold'] }).tag // 'fire'
```

You have to supply the list, because "fire" means nothing on its own. It might be a damage type, a colour, a material, a school of magic. Which one depends entirely on what you are building, so the library knows a formula can end in a label and nothing whatsoever about which labels are real.

### Errors You Can Put In Front Of Someone

Every error quotes the text it could not read, shortened, so it can go straight to the person who typed it.

```ts
roll('2d6 + x') // Cannot parse "2d6 + x" near "+x"
```

Anything it cannot read throws, so handling it is an ordinary `try`/`catch`. There is no error result to remember to check and no `null` to fall through.

```ts
try {
  const result = roll(input, { tags: ['fire', 'cold'] })
  showRoll(result)
} catch (error) {
  const message = error instanceof Error ? error.message : 'Could not read that formula'
  showError(escapeHtml(message))
}
```

If you would rather catch it earlier, `parseFormula()` throws the same errors without rolling anything, so a text field can go red while the person is still typing.

A character it will not accept is named by its code point rather than repeated back. An error can therefore never carry a payload into wherever you display it. That makes the message safer to show, not safe — escape anything you put on a page, from here or from anywhere else.

## The Randomness Underneath

All of this arrives without being switched on. There are no options for fairness, because fairness is not a setting.

### Why Not Math.random

`Math.random()` is not required to be good. The JavaScript standard leaves the algorithm to the implementation and makes no promises about quality. So the answer to "how random is it" depends on which engine you happen to be running in.

`@openfray/dice` use `crypto.getRandomValues` instead. It is in every browser and in Node, it costs nothing at the scale a dice roller works at, and it does not vary underneath you.

### The Bias Nobody Would Notice

Turning a random 32-bit number into a d6 by taking a remainder is the obvious approach, and it is very slightly wrong. There are 4,294,967,296 possible draws and six faces, and six does not divide evenly into that. Four faces end up fractionally likelier than the other two.

Fractionally is the right word. The gap is around one part in seven hundred million, and no table would ever see it. It is exactly the kind of flaw I found in the tracker later: real, and never once decisive.

The library throws away the draws that would cause it and draws again, so every face is exactly as likely as every other. The fix costs a few lines and a rejection every few billion rolls. There is no reason to leave it in.

Every die also gets its own draw. Several dice are never squeezed out of one number. That is why a die can have at most 4,294,967,296 sides. One draw covers exactly that many faces, and the fairness rests on one draw each.

### Nothing Gets Nudged

There is no logic in here that notices you have rolled badly and quietly makes it up to you. There never will be.

> Real dice come up 1 three times in a row sometimes. So do these.

That is not a limitation to apologize for. It is the entire point. Any code that smoothed out a bad streak would turn every log of every roll into a lie. A log I could hand to somebody was the whole reason I wrote this.

The one place the guarantee stops is the `rand` option, which lets you supply your own randomness for tests:

```ts
roll('1d20', { rand: () => 0 }) // always 1
```

That is genuinely useful and genuinely dangerous. A result records what the dice showed, never where the numbers came from, so a rigged source produces a result indistinguishable from a fair one. If someone using your program can choose the source, they can choose the roll.

Which is why `cryptoRandom()` is exported at all. You can call the raw source directly, inspect it, wrap it, or test it. Nobody has to take my word for how the dice work. After that night, taking somebody's word was what I had run out of patience for.

## What It Won't Do

Most of the work was not in what the library does. It was in deciding what to refuse, and every refusal is a decision handed back to the person who should be making it.

**There is no division.** Halving a total needs a rounding rule — down, to nearest, in whose favour — and there is no neutral choice. Picking one would be the library deciding what your roll means. `Math.floor(total / 3)` is yours to write and says exactly what you chose.

**A formula has to roll something.** `2+5` is refused. It is 7 whoever works it out, and answering it would mean handing back a total with an empty list of dice behind it. A number with nothing to show for itself is the one thing this package exists not to produce.

**Exploding dice will not combine with keep-highest.** `4d6kh3!` is rejected rather than guessed at. "Keep the best three" stops meaning anything once every die is an open-ended chain. There is a defensible reading of it. There are also two or three others, and picking one silently would be worse than saying no.

**Totals that cannot be exact are refused.** Past 9,007,199,254,740,991, JavaScript stops counting in whole numbers. Rounding quietly at that point would produce a result that looks like every other result and is not one.

**A formula cannot contain a line break.** This is the refusal I like most. `result.formula` hands you back the text you passed, exactly as you passed it. That string tends to end up in a log:

```
mallory rolled 1d
20 = 5
```

One roll, two lines, and a log nobody can trust — which is the precise opposite of the point. The same reasoning rules out characters that merely resemble the ones a formula uses. `4d6Kh3` written with a Kelvin sign is refused rather than quietly read as `4d6kh3`.

**There are ceilings on what one formula may ask for.** Each is refused with an error rather than attempted.

| Limit                          | Why                                                                        |
| ------------------------------ | -------------------------------------------------------------------------- |
| 1,000 dice in one roll         | Every die is rolled separately. `99999999d6` asks a program to stop responding. |
| 4,294,967,296 sides on a die   | One random draw covers exactly that many faces.                            |
| 100 bonuses on one roll        | Each is read as a formula before the dice can be counted.                  |
| 1,000 characters in a formula  | Longer than anyone types.                                                  |
| 100 explosions on one die      | A fair d6 reaching ten in a row is a one-in-sixty-million event.           |

All of them sit far above ordinary use. Reaching one means something is generating formulas rather than a person writing them.

And the largest refusal of all: **the library has no rules.** It rolls dice and reports what happened. Whether a 20 is good, whether a label means fire damage, whether a total passes or fails — none of that is its business.

## I Went Back And Read The Code

A couple of months later, with my own dice working, I did the thing I had skipped. I opened the tracker's source and read how it rolled.

Two things stood out, and neither was what I half expected to find.

The first is a rounding choice. It builds a die with `Math.ceil(Math.random() * sides)` instead of `Math.floor(Math.random() * sides) + 1`. Those two agree on every value but one. `Math.random()` is allowed to return exactly `0`, and `Math.ceil(0 * 20)` is `0` — a d20 showing zero. The odds are about one in nine quadrillion. It is the textbook off-by-one that the `floor + 1` idiom avoids by construction, sitting there harmlessly.

The second is where the randomness comes from. `Math.random()` in V8 is xorshift128+. It is not biased, and it is not weak in the everyday sense. But its internal state can be recovered: watch enough outputs and you can work out what comes next. For a tracker where the DM is the only person clicking, that is a fair trade. For anything where a player stands to gain by predicting the next roll, it is not.

Neither of those killed a character. Nothing in that file was nudging results. The zombies that ate my party were just zombies having a good night.

So I built a library to solve a problem that, on the night in question, did not exist.

I would do it again. Finding that out took reading the source, and that option was open to me for exactly one of the two programs involved.

> The dice were probably fair all along. What I wanted was to be able to say so.

## Dice I Can Hand To The Table

The dice did not fix the fight that started this. Nothing was going to.

What changed is smaller. When an encounter goes sideways now, there is a log I can trust. Every die thrown, the ones that counted, the ones that did not, the arithmetic in between. "You got unlucky" stopped being something my players have to take from me.

My table still rolls in D&D Beyond, and I have no intention of asking them to stop. That gap is theirs to care about or not, and mostly they do not. Which is a perfectly reasonable way to play a game about pretending to be creatures who get to sleep eight hours every night.

Games have taught me more about running things than most of my working life has, which I have [[gaming-made-me-better-leader|written about before]]. This one taught me that trust is not a feeling you can talk somebody into. It is a property of what you can show.

Writing the dice took a few weekends, in the [[adhd-planner|bursts I have learned to expect]]. Deciding what they would refuse to do took considerably longer, and that is the part I would keep.
