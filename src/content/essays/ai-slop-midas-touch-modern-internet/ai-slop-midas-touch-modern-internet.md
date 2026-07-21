---
title: "Touched by AI, Treated Like Slop: The Midas Touch of The Modern Internet"
date: 2025-11-24T16:05:32
updated: 2026-05-12T22:44:57
sticky: false
cornerstone: false
excerpt: Is the term “AI Slop” used too widely and slapped on anything touched by AI like a cursed Midas Touch?
categories:
  - Observations
tags:
  - AI
  - Automation
  - Creativity
  - Gaming
  - Productivity
coverAlt: The letters ‘AI?’ handwritten in dark marker on a whiteboard.
coverCaption: Photo by <a href="https://unsplash.com/@nahrizuladib?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText">Nahrizul Kadri</a> on <a href="https://unsplash.com/?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText">Unsplash</a>
cover: ai-slop-midas-touch-modern-internet.jpg
---

> [!summary]- Quick Summary
>
> - I ran a real NLP/emotion-analysis study on Dead by Daylight Steam reviews and shared a summarized version on the DbD subreddit.
> - The thread largely ignored the methodology and results and instead focused on attacking the fact I used AI for an infographic and AI-assisted writing.
> - This reaction came from AI-slop fatigue and purity tests around “real” work, not from any evidence that the study itself was fake or lazy.
> - The experience reinforced my own line: AI can help with expression and packaging, but not with thinking, data, or responsibility.
> - From a leadership and “gamer brain” perspective, it became a lesson in choosing the right arenas, reading the meta, and knowing when to walk away from bad-faith fights.
>
> AI-generated summary based on the text of the article and checked by the author. [Read more](/artificial-intelligence-tools/ "BUT. Honestly Artificial Intelligence Tools") about how BUT. Honestly uses AI.

I love Dead by Daylight. If you don’t know what it is, [Dead by Daylight](https://store.steampowered.com/app/381210/Dead_by_Daylight/) (DbD) is an asymmetrical 4v1 multiplayer horror game where one Killer hunts four Survivors trying to escape.

I love it not in the “I play it sometimes” way. In the “I think about this game enough to write [[distilroberta-emotion-analysis-nlp-case-study|the equivalent of a dissertation about it]]” way.

So when I decided to share my study on the Dead by Daylight subreddit, it felt like a nice overlap of everything I care about:

- the game I genuinely enjoy
- natural language processing and model behavior
- and a good way to give back to the community and maybe even reach the developers with genuine data

I hit “post” feeling a little nervous but mostly excited.

I quickly got a couple of upvotes, and then I got absolutely flattened.

Not because the data was wrong.  
Not because the methodology was flawed.  
Not because the conclusions didn’t make sense.

But because I used AI, and that meant my content was AI slop, according to Reddit.

## Posting AI-Assisted Work Into a Hostile Reddit Meta

When people say “AI slop”, they usually mean low-effort, AI generated content sprayed out for clicks: generic blog posts, fake studies, or sludge that feels like no human cared. That’s the AI slop meaning people carried into my post before they even saw the actual work.

The Reddit post is gone now, and I explain why I deleted it below, but here’s the short version of what I shared:

- I ran a case study using DistilRoBERTa to analyze emotions in Dead by Daylight Steam reviews.
- I summarized the core findings directly in the Reddit post so people **didn’t** have to click my blog if they didn’t want to.
- I included an infographic from the article to quickly convey the main results (the same one at the end of the essay).
- I linked to the full study on my blog for anyone who wanted to dig into the details.

That infographic? Made with AI, NotebookLM to be specific.

The article? Written by me, but like everything on BUT. Honestly, it was **assisted** by AI, helping with phrasing, structure, and clarity—never deciding the ideas, never inventing results. I’m very open about this on the page about [how I use AI tools on BUT. Honestly](/artificial-intelligence-tools/).

So when people in the post started pointing out what I didn’t even try to hide, I responded honestly:

- The infographic was made with AI.
- The analysis used AI (NLP) for emotion detection.
- The post was written by a human and reviewed and adjusted with AI.

I thought that level of transparency would build trust. It did the opposite.

## “If AI touched it, I don’t care”

A chunk of the comments never got past one simple filter:

- AI image → lazy, slop, untrustworthy
- AI-assisted writing → fake, not worth reading
- AI used anywhere → the entire study is suspect

They didn’t question the dataset.  
They didn’t poke holes in the experimental setup.  
They didn’t argue with the conclusions.

They went straight for:

- “You could have made this yourself, there were tools 20 years ago that did this.”
- “If you can’t be bothered to put in the effort to actually make it, no one is going to bother reading it.”
- “Just more AI slop.”

The irony is almost comical:  
I did a case study on **AI-driven emotion analysis**, then got discredited because I used… AI… in the workflow.

The message underneath all of this was loud and clear: if AI touched it, your work doesn’t count.

And that’s the part that hurt.

## Facts, Feelings, and the Missing Curiosity

I follow a specific format when [[mastering-effective-feedback-facts-feelings-curiosity|I give effective feedback]]: start with **facts**, own your **feelings**, and add **curiosity** instead of assumptions.

What I got on Reddit was:

- some facts (“You used an AI-generated infographic”)
- a lot of feelings (“I hate this, I’m sick of AI everywhere”)
- almost zero curiosity (“Can you show more of the raw data?” “Can you walk us through the model?”)

There was a version of this conversation that could have been good:

> “I’m worried about AI-generated studies that fabricate results.  
> Can you show how you collected the data and applied DistilRoBERTa? Is there a way to see your notebooks or methodology?”

That would’ve been **great** feedback. I would’ve happily answered those questions, linked more notebooks, and even added a separate methodology section just for them. Although if people would have bothered even opening the essay, they would have found the answers to all of this already there. Including the notebooks and datasets.

Instead, the vibe was more:

> “We’re drowning in AI garbage, and anything that even smells like AI is going in the trash.”

I understand the fear. Truly.

We are swimming in low-effort, auto-generated sludge.  
People are tired of being tricked, used for clicks, or served vaguely coherent “content” with no real work behind it.

But the leap from “AI slop exists” to “anything AI-touched is slop” is lazy thinking. Then there are those who hop on the “AI steals jobs/credits” or “Let’s hate AI just because” bandwagons.

It’s also exactly backwards: the people willing to **disclose** their AI use are usually the ones doing the real work.

## What AI Actually Did (and Didn’t) Do

Let’s get specific. For the [[distilroberta-emotion-analysis-nlp-case-study|Dead by Daylight emotion analysis]], here’s what **I** did:

- Chose the topic and research question
- Collected and cleaned Steam review and game patches data
- Decided on the approach
- Selected DistilRoBERTa and set up the pipeline
- Ran the experiments, inspected outputs, and adjusted where needed
- Interpreted results in the context of the game (perks, metas, design decisions, community sentiment)
- Decided which findings were meaningful or surprising

Here’s what **AI** did:

- Helped me draft and refine the article text
  - I wrote the overall draft, AI helped me untangle clunky sentences and tighten structure or rewrite some parts that just didn’t feel right.
- Generated a quick infographic from the numbers I provided
  - Because I would rather not spend a weekend learning a design tool to make one chart.
- Pointed out a few places where the explanation could be clearer or more digestible for non-ML readers.

If AI disappeared tomorrow, I would still:

- care about the same questions
- run the same analyses
- stand behind the same conclusions

That’s also how I frame it on my [AI tools page](/artificial-intelligence-tools/): AI is allowed to help with **expression and packaging**, not with thinking or integrity.

Is that “slop”?

If your standard is: “Anything less than doing everything by hand is morally compromised,” then sure, maybe.

But let’s be consistent, then:

- No more calculators.
- No more IDEs with autocomplete.
- No more no-code dashboards, blogging platforms, or layout tools.
- Back to Notepad and FTP for everyone.

We don’t actually live like that.

We accept tools everywhere…  
Until the tool is called “AI,” and then we pretend it erases the human.

## The Weird Double Standard Around Writing

I’ve written before about [[vibe-writing-line-between-human-machine|vibe writing in 2025]]: our tolerance for AI changes dramatically depending on _where_ it shows up.

- AI helping you refactor code? Efficient. Smart.
- AI helping you phrase something better? Suspicious. Inauthentic.
- AI summarizing a long document? Useful.
- AI helping you write a blog post? “So you didn’t really write it, then.”

Writing is tied to identity. People see it as their voice, their self.

So when they see text that feels “AI-ish” or an AI-branded infographic, their brain goes:

> “You tricked me. This isn’t _you_.”

Even when it actually _is_ you, your thinking, your structure, and your decisions, with a tool smoothing the edges. And that’s precisely why this Reddit experience got to me on a personal level.

I’m not interested in pretending I don’t use that tool. If an AI model helps me say what I mean more clearly, I’m going to use it.

If an AI image tool lets me turn a table of numbers into a readable graphic in five seconds, I will use it.

I care that **my thoughts are mine, my judgment is mine, and my responsibility is mine**. The tool doesn’t get authorship; it gets a footnote.

## Dead by Daylight, Leadership, and Choosing Your Arenas

This is the part where my Dead by Daylight habit and my leadership brain collided.

I’ve written about [[gaming-made-me-better-leader|how gaming made me a better leader]]: pattern recognition, risk management, knowing when to commit and when to disengage, and treating each match as information.

That Reddit thread felt like a boss fight I walked into under-leveled.

Here’s what it taught me, leadership-wise:

### 1\. Love the Game, but Respect the Meta

I genuinely love Dead by Daylight. I did this study because I enjoy the game enough to spend hours digging into the emotional landscape of its reviews.

But loving the game doesn’t mean every community space around it is a good place for in-depth work.

The current “meta” in that subreddit seems hostile to anything that looks AI-adjacent, even when it’s transparent and backed by real effort. And I blame it on myself, I should have known better, having experienced that specific subreddit before.

As a leader of my own creative work, I have to respect that. Not agree with it, but **factor it into my decisions**.

Sometimes leadership is knowing: “I can’t win this match on my build. I’ll take the loss and queue somewhere else.”

### 2\. Separate Signal From Noise

In the pile-on, there was one long comment that, under the heat, contained real signal:

> “Your use of AI presentation makes people doubt the reliability of your work before they even see it.”

I don’t like how it was delivered.  
I don’t agree with the sweeping assumptions about my effort.

But that kernel is worth keeping: **first impressions matter**.

In some spaces, leading with an obvious AI-generated visual or AI-smoothed tone will tank trust so fast people never even reach your actual work.

As a leader, that doesn’t mean I abandon my tools.  
It means I:

- adjust how I present my work depending on the audience
- or decide that some audiences just aren’t worth the energy

### 3\. Know When to Stop Playing

If at first I was very polite, understanding, and open, near the end my replies shifted. I went from explaining my process to:

> “I don’t think this is the place to post serious stuff. I’ll stick to stupid memes instead.”

That was my “DC from this match” moment.

Not my most graceful, but honest: I recognized that I was taking value damage for no good reason. Emotionally, it felt personal and humiliating. Rationally, it was a bad trade: deep effort versus drive-by contempt.

Leadership isn’t staying in every fight to the bitter end. Sometimes it’s saying “This isn’t a real conversation anymore. I’m out.”

And then using what you learned to make better calls next time.

## Where I Draw My Line with AI and Work

If anything, this experience strengthened my previous position.

AI is allowed to:

- help me express myself more clearly
- speed up boring or fiddly tasks (infographics, rewrites, structure)
- translate my thoughts into cleaner prose
- act as a rubber duck for thinking through ideas

AI is **not** allowed to:

- decide what I think
- fabricate data or results
- publish anything I wouldn’t sign with my own name
- replace my responsibility for what appears under “BUT. Honestly”

If that still makes some people see my work as invalid, that’s their standard, not mine. I’m not going to pretend I hand-crafted every pixel and syllable to prove I “deserve” to be heard.

I’d rather spend my limited time doing what actually matters:

- building things I care about
- studying the things I love
- writing honestly about the strange, frustrating, exciting ways humans and machines collide

If part of that involves letting an AI model help me shape an essay or generate a halfway decent chart in five seconds, I can live with that.

What I’m not willing to do is throw away my work, or my joy, because someone has decided that “AI touched it” is all they need to know.

I know how much effort was behind that case study.  
I know why I did it.  
I know what I learned from it.

The AI slop war will rage on, with or without me.

Meanwhile, I’ll be over here, queuing another match, doing real work, and staying honest about the tools I use to ship it. If you want to read more, subscribe to the newsletter, bookmark my site, or [add me on Steam](https://steamcommunity.com/id/gnabbo/) to play some games together. If not, I understand, and I accept if you never want to read my writing again.

Good bye.
