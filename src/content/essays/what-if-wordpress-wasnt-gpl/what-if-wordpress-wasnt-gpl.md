---
title: What If WordPress Hadn't Been GPL?
date: 2026-10-06
updated:
sticky: false
cornerstone: false
excerpt: WordPress is GPL, and that isn't changing. But what if it weren't? A thought experiment about the license that quietly decided what WordPress became.
categories:
  - Observations
tags:
  - WordPress
  - Creativity
  - Workflow
cover: wordpress-wasnt-gpl.jpg
coverAlt: WordPress logo comparison showing “MIT Licensed” on a blue background versus “All Rights Reserved” on a dark red background.
coverCaption:
downloads:
audioVoice: Enceladus
audioStyle: reflective
audioPace: conversational
---

> [!summary]- Quick Summary
>
> - WordPress didn't **choose** the GPL — it **inherited** it by forking b2/cafelog, which Michel Valdrighi had already released under the GPL.
> - This is a **thought experiment**, not a proposal. WordPress is GPL, that isn't changing, and this is one person's point of view.
> - **If it were MIT:** WordPress would likely be smaller, its parts carried off into other CMSes and closed plugins. A plugin like WooCommerce could have shipped closed — installable, but not readable or extendable.
> - **If it were all rights reserved:** no fork, no free self-hosted tool, no WordPress Foundation. Maybe only a hosted WordPress.com, with no other way in.
> - **If it were a mix:** the least hypothetical case. WordPress already runs on permissive dependencies like React, and the 2017 React relicensing shows how real the copyleft-versus-permissive tension gets.
> - A license isn't paperwork. It's a decision made at **every boundary**, and it shapes what a project can become.
>
> AI-generated summary based on the text of the article and checked by the author. [Read more](/artificial-intelligence-tools/ "BUT. Honestly Artificial Intelligence Tools") about how BUT. Honestly uses AI.

![[what-if-wordpress-wasnt-gpl.mp3]]

WordPress never chose the GPL. It inherited it.

My team ran a learnup recently. Two colleagues had read my essay on [[how-to-choose-a-software-license-for-your-next-project|choosing a software license]], and they built a session around it. We started with where WordPress came from. Then we walked through the license types — MIT, GPL, BSD, all rights reserved. Then someone asked the question that turned a tidy history lesson into an argument.

> What if WordPress had never been GPL?

We didn't land on an answer. I'm not sure there is one. But I haven't stopped turning it over since, so this essay is me thinking out loud — not a verdict, just a point of view.

> [!disclaimer]
> This is a thought experiment and my own point of view — **not** a position held by Automattic Inc. or any of its brands. WordPress is GPL, and nothing here suggests that is changing.

## The Decision That Wasn't One

Here's the part that's easy to miss. WordPress didn't sit down and pick the GPL.

It inherited it. Even if Matt Mullenweg and Mike Little (the founders of WordPress) didn't want to use GPL, they wouldn't have had a choice.

Before WordPress there was b2/cafelog, a small PHP and MySQL blogging engine written by Michel Valdrighi around 2001. Valdrighi released it under the GPL. Then, around 2002, he went quiet. The updates slowed and stopped.

In a closed-source world, that's where the story ends. The author leaves, the code freezes, the tool fades. But b2 was GPL, so the code stayed free to study, change, and build on. In 2003, Matt and Mike forked it. That fork became WordPress.

The license wasn't an afterthought, even then. Weighing his options in a [January 2003 post](https://ma.tt/2003/01/the-blogging-software-dilemma/), Matt ruled out TextPattern over its license and settled on b2 for one reason:

> “Fortunately, b2/cafelog is GPL, which means that I could use the existing codebase to create a fork, integrating all the cool stuff that Michel would be working on right now if only he was around.”

> [!screen-only]
> Iterative Wonders tells that origin story better than I could, so I'll point you there rather than retell it: [It Was Just a Blog Fix… Until It Was WordPress](https://iterativewonders.com/2025/11/21/it-was-just-a-blog-fix-until-it-was-wordpress/).

The detail that matters here is the license. Copyleft travels with the code. Fork a GPL project and your fork is GPL too. So WordPress's license was settled from two directions at once. Valdrighi put GPL on the table years earlier, and forking his code locked it in. Matt didn't resist that pull. By his own account he wanted GPL, and chose b2 partly because of it. The outcome was never really in question.

Every "what if" that follows changes one thing, and only one: the license on that code. What if what Matt and Mike picked up had come with different terms?

## What If It Were MIT?

Start with the friendliest alternative. MIT is short, permissive, and generous. Use the code however you like, keep the copyright notice, and you're done. No obligation to share what you build on top.

That generosity is exactly the problem.

Under the GPL, if you improve WordPress and ship it to others, you have to ship your changes as source too. Your fork stays open. Under MIT, you don't. You can take the code, close it, and sell it, and you owe the project nothing back — not even a copy of your improvements.

So picture b2 released under MIT instead. Matt and Mike still fork it. WordPress still ships. But now every hosting company, every agency, every ambitious developer who wants their own content engine can take the codebase, wall it off, and never return a line.

I think WordPress itself would be smaller for it. Not dead — smaller. The best people would still build on the code, but they'd build *away* from it, not into it. You'd get a dozen half-open CMSes carved out of the same source, each with a few proprietary tricks the others couldn't use. WordPress would be one option among many, not the commons everyone improves at once.

MIT hands you the parts. GPL makes you give the improvements back. That difference is small on paper and enormous over twenty years, because it decides whether effort *pools* or *scatters*.

The plugin economy is the tell. Thousands of developers extend WordPress and release under the GPL because the platform's license nudges them there. Strip that nudge out and a lot of that work goes private, sold as closed add-ons or folded into someone's hosted product. The extensions might still exist. The shared, searchable, install-it-yourself library probably wouldn't.

Take WooCommerce. It's a WordPress plugin, so it's GPL — the copy you install is open, and you can read it, change it, and extend it.

If WordPress had been MIT, WooCommerce could have shipped closed. You'd still download and install it, but you couldn't see the source or extend it yourself. Want a feature? You'd buy the extension from WooCommerce, or ask them to build it for you. The store on your own server would be a black box you're allowed to run, not something you own.

## What If It Were All Rights Reserved?

MIT gives the work away. All rights reserved refuses to give it at all.

This is the closed end of the spectrum. No forking, no reuse, no legal way for a stranger to build on your code. Which means the fork that started WordPress never happens — Matt and Mike open b2, read the license, and close the tab.

So play it forward differently. Imagine WordPress had been a closed product from the first commit. A company owns the code. You don't download it, you sign up for it.

I think what you'd get is WordPress.com and nothing underneath it. A hosted service — pay a monthly fee, get a site, pick from the themes on offer. No free version to install on your own server, no WordPress.org, no host offering one-click WordPress, because there'd be nothing for anyone to hand you. Something closer to a [[10-types-of-websites|hosted site builder]] than to the WordPress we know.

If you wanted WordPress, there'd be one door. WordPress.com. No choice.

And no WordPress Foundation. The Foundation exists to hold the project — the trademark, the community assets — in trust, so that no single company owns WordPress outright. A closed product doesn't need one. There's nothing to hold in trust. The company is the owner, full stop.

The ecosystem goes too. The themes, the plugins, the tens of thousands of people who make a living building on WordPress. Most of that exists because the platform is open and anyone can extend it. Close the platform and that work has nowhere to attach. You'd get whatever the company shipped, and whatever it chose to let partners build.

Here's the part I keep coming back to. Proprietary software lives and dies with its company. When Valdrighi walked away, b2 didn't die, because the license had already set it free. An all-rights-reserved WordPress would have been tied to whoever owned it — one acquisition, one bad year, one change of strategy away from disappearing. The GPL is why WordPress can outlive any single owner. All rights reserved would have made an owner mandatory.

## What If It Were a Mix?

This is the one I find most interesting, because it's the least hypothetical. WordPress already is a mix.

The idea: keep WordPress itself GPL, but build its core out of smaller packages under permissive licenses. Gutenberg — the block editor — as its own generic MIT package, developed on its own, that any app could use and WordPress just happens to include. The hooks system, the thing that lets plugins tap into WordPress, pulled out into a standalone MIT library. The whole stays copyleft. The parts travel freely.

Here's why it's not hypothetical. Gutenberg is built on React, and React is MIT. WordPress is a GPL project standing on a pile of permissive dependencies — it always has been. The whole is copyleft. A lot of the parts underneath are not.

And the seam between those two worlds has drawn blood before. Back in 2017, React didn't carry a clean MIT license. It shipped under a BSD license plus a separate patents grant that made a lot of people nervous. The Apache Foundation had already barred it from its projects. Then Matt Mullenweg [announced](https://ma.tt/2017/09/on-react-and-wordpress/) that WordPress would move off React and rewrite Gutenberg on something else. His reason was scale:

> “Core WordPress updates go out to over a quarter of all websites, having them all inherit the patents clause isn't something I'm comfortable with.”

About a week later, Facebook relicensed React — along with Jest, Flow, and Immutable.js — under plain MIT.

I want to be careful with that story. Facebook didn't credit WordPress. Its [stated reason](https://engineering.fb.com/web/relicensing-react-jest-flow-and-immutable-js/) was the broad ecosystem and a community it had "failed to decisively convince." WordPress was one voice in a louder chorus — Apache, and a wave of teams already dropping React. But it was a loud voice, and the timing is hard to ignore. The platform behind a quarter of the web said no, and a week later the clause was gone. Draw the causal arrow as lightly as you want. The point stands: the mix isn't a diagram, it's a negotiation, and the copyleft side was in the room.

The version I keep imagining goes further than consuming other people's permissive packages. It's about WordPress publishing its own pieces that way — a Gutenberg anyone could drop into any project, a hooks library with no WordPress attached. Some of that already happens; WordPress ships its editor as npm packages. But they carry the GPL, like the rest of WordPress. Make them MIT and they'd spread past WordPress entirely — into other editors, other frameworks, built on WordPress's own blocks.

There's a cost, and it's the same one from the MIT section. An MIT Gutenberg could be taken and closed. Someone builds a proprietary editor on it and owes WordPress nothing back. You trade the guarantee for the reach. The generic package travels further. The copyleft package keeps its improvements.

Which is the real lesson of the mix. A license isn't one decision you make for a whole project. It's a decision you make at every boundary — this package copyleft, that one permissive — and each boundary strikes a different bargain between spreading and holding.

## Where I Land, For Now

Three what-ifs, three different WordPresses. MIT: smaller, scattered into forks and closed plugins. All rights reserved: one hosted product, one door, no commons at all. A mix: a copyleft whole standing on permissive parts, which is more or less where we already are.

None of these is the true answer. It's a thought experiment. WordPress is GPL, that isn't changing, and I'm not arguing it should.

What the exercise changed for me is subtler. I already thought licenses mattered — I wrote a whole [[how-to-choose-a-software-license-for-your-next-project|essay]] on choosing one deliberately. But that essay was about your own project: what you protect, what you let others do. This counterfactual is about everything downstream of the choice. Change WordPress's license and you don't get the same WordPress with a different footer. You get a different building, a different internet.

Copyleft is why there's one WordPress instead of fifty half-open forks, and why a stranger could pick up Valdrighi's abandoned code and the result is still free twenty years later. Not because the code was special. Because the license decided what could happen to it.

That's how I see it. You might run the same three what-ifs and land somewhere else — that's rather the point of a thought experiment. The most consequential file in a project is often the one nobody reads.
