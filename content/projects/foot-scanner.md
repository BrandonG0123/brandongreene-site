---
title: Foot scanner for custom orthopedic insoles
summary: A low-cost foot scanning and fabrication pipeline, with the goal of making custom orthopedic insoles cheaper to produce.
status: in-progress
areas: [hardware, software, research]
started: 2026-09-11
featured: true
collaboration: solo
links: []
---

<!--
  Brandon — this page is deliberately short. It contains only what you have
  actually told me. When you send the specifics from the interview, this file
  grows into the full case study shape:

    1. One sentence: what it is and who it is for   (frontmatter `summary`)
    2. The problem, concretely
    3. What I built — with a real image or diagram at the top
    4. How it works — the technical core
    5. Results and evidence — numbers, users, measurements
    6. What failed / what I'd do differently   <- never cut this one
    7. Links

  See CONTRIBUTING.md.
-->

## The problem

Custom orthopedic insoles are made to the shape of a specific foot, and that
custom fit is expensive. The aim of this project is to find out how much of that
cost is unavoidable and how much comes from the scanning and fabrication steps —
the parts a 3D printer and a decent scanning method might be able to replace.

I don't yet have a verified figure for what a custom pair actually costs. Getting
a real number, from a real source, is one of the first things on the list.

## Where it stands

I started this in the second week of September 2026, alongside the independent
study. It is at the beginning: the problem is defined, the approach is not
settled yet.

## What I'm figuring out

These are open, not rhetorical. Each one becomes a log entry when it's answered.

- How to capture foot geometry accurately enough to matter, and cheaply enough
  to be worth doing — photogrammetry from a phone, a depth sensor, or something else
- Where machine learning genuinely helps in the pipeline rather than being bolted on
- What "accurate enough" actually means here, and how I'd measure it against a
  known reference object
- What a printed insole costs in materials and time, measured rather than estimated

## Honest scope

This is an engineering project about scanning and fabrication cost. It is not a
medical device, it has not been tested on anyone, and it makes no claim about
treating any condition.
