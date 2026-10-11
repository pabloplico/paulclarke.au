---
title: "Your AI Tool Isn't Thinking — Here's What It's Actually Doing"
date: "2026-03-05"
excerpt: "AI tools are genuinely useful — but not for the reasons most people think. A plain-language breakdown of what the research actually says, so you can make smarter decisions without getting caught up in the hype."
tags: ["AI", "Strategy", "Australian Business", "AI Literacy"]
---

AI tools are genuinely useful — but not for the reasons most people think. And once you understand what's actually going on under the hood, you'll be much better placed to use them well and avoid expensive mistakes.

I wanted to share some information from **George D. Montañez PhD**, Associate Professor of Computer Science at Harvey Mudd College. This post summarises his talk, "AI 'Thinking' and 'Reasoning' Are Illusions,".

## What AI tools are actually doing

When you type a question into ChatGPT, Claude, or any other large language model (LLM), it doesn't "think" about your question the way a human expert would. It doesn't consult knowledge, weigh up options, or reason through a problem.

What it does is **predict the most statistically likely next word**, then the next, then the next — based on patterns learned from billions of documents.

That's it. It's a very sophisticated pattern-matching machine.

This isn't a criticism — it's genuinely impressive engineering, and those patterns are useful. But it explains a lot of the strange behaviour you've probably already noticed: confident wrong answers, made-up facts stated as certainties, and advice that sounds authoritative but falls apart under scrutiny.

## "But it shows its working" — the chain of thought problem

You might have seen AI tools that "think out loud" — walking through their reasoning step by step before giving an answer. This looks compelling. Surely if it's showing its work, it must actually be reasoning?

Recent research says no. Studies from machine learning researchers have found that these reasoning traces are often **performative rather than functional** — the AI produces text that *looks like* logical thinking without that text actually driving the conclusion. In some cases, the model had already "decided" its answer before the reasoning steps were written.

## The information problem

An AI model is trained on a fixed dataset — everything it knows comes from text that existed before its training cutoff. Once trained, it can't generate genuinely new information. It can only recombine and repackage what it already absorbed.

This is sometimes called the **conservation of information** principle — you can't get more useful signal out of a system than was put into it. An AI can make information feel new by presenting it in novel combinations, but it isn't creating knowledge from scratch.

This matters practically. If you ask an AI about your specific business situation, your local market, or something that happened recently, it's working from generalised patterns — not real knowledge of your context. The more specialised or current your question, the less reliable the answer.


## Where it goes wrong in business settings

For QLD small business owners, the risk isn't that AI is useless — it's that it's **confidently wrong in ways that aren't obvious**.

A few patterns worth knowing:

**Maths and logic tasks.** Research has shown LLMs struggle significantly with mathematical reasoning, especially when numbers are slightly changed from examples they've seen before. If you're using AI to check figures, build estimates, or analyse financial data — **verify everything independently**.

**Specialist advice.** AI has absorbed a lot of general text about law, tax, HR, and finance. It can produce text that *sounds like expert advice*. It isn't. In regulated industries like financial services, healthcare, or construction, acting on AI output without professional review is a real risk.

**Repetitive training loops.** There's a growing body of research on what happens when AI tools are trained on content that was itself AI-generated. Quality degrades — fluency stays high, but accuracy and factual reliability drop. As more of the internet fills with AI-generated content, this becomes a longer-term concern for anyone relying on AI tools for research.


## So what is it actually good for?

Plenty, as long as you match the tool to the task.

AI tools perform well when the task is about **form over content** — when the pattern and structure of the output matter more than precise factual accuracy:

- Drafting a first version of an email, proposal, or job ad
- Summarising a long document you've already read
- Generating options or ideas to react to (not copy verbatim)
- Reformatting or reorganising information you've provided
- Handling routine, repetitive customer communications with human review

The common thread: **you're the expert, the AI is the drafter**. You bring the judgment, context, and verification. It handles the volume.

## Three questions to ask before using AI in your business

Before adopting any AI tool, it's worth running through these:

1. **Is this task about pattern and form, or precise facts and judgment?** If it's the latter, AI is a starting point — not a finish line.
2. **Would a wrong answer cause real harm?** Financial, legal, safety, or reputational consequences change the calculus entirely.
3. **Do I have a way to verify the output?** If you can't check it, you probably shouldn't rely on it.

## The bottom line

AI is a real and useful technology — but it works differently from how Silicon Valley tends to describe it. It doesn't think, reason, or understand. It recognises patterns and generates plausible text.

Used with that in mind, it can genuinely save you time and money. Used without it, it can quietly create problems that are expensive to unpick.

The businesses that will get the most value from AI over the next few years won't necessarily be the ones who adopt it fastest. They'll be the ones who adopt it most clearly — knowing what it can do, what it can't, and where the line is.

---

**Source & References**

This article is based on a public lecture by **George D. Montañez PhD**, Associate Professor, Department of Computer Science, Harvey Mudd College: *"AI 'Thinking' and 'Reasoning' Are Illusions — Here's What Recent Research Says Is Really Going On."* You can find more of his AI talks on YouTube and connect with him via [linkedin.com/in/georgemontanez](https://linkedin.com/in/georgemontanez).

Key research papers referenced in his talk:
- Mirzadeh et al., *GSM-Symbolic: Understanding the Limitations of Mathematical Reasoning in Large Language Models* (2024)
- Turpin et al., *Language Models Don't Always Say What They Think: Unfaithful Explanations in Chain-of-Thought Prompting* (2023)
- Chen et al., *Reasoning Models Don't Always Say What They Think* (2025)
- Palod et al., *Performative Thinking? The Brittle Correlation Between CoT Length and Problem Complexity* (2025)
- Shumailov et al., *The Curse of Recursion: Training on Generated Data Makes Models Forget* (2023)
- Keisha et al., *Knowledge Collapse in LLMs: When Fluency Survives but Facts Fail under Recursive Synthetic Training* (2025)
- Claude Shannon, *A Mathematical Theory of Communication* (1948)