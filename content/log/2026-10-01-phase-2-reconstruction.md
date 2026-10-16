---
title: Photos of a foot, turned into a model in millimetres
date: 2026-10-01
project: foot-scanner
draft: true
---

<!-- DRAFT from the footscan git history (1 Oct 2026, "Phase 2: reconstruction
     to millimetres, with an accuracy study"). Brandon: read it, then delete this comment and the `draft: true` line. -->

Built Phase 2 of the scanner: the reconstruction step. Photos taken around a foot
on the printed scan mat go in, and a 3D model comes out, scaled to real
millimetres.

The same step runs an accuracy study. It rebuilds the calibration object, a
printed block whose true size is known, so the scanner's error can be measured
against something real instead of guessed. At this point it was built but still
waiting for real scans.

Built with Claude Code, which wrote most of the code while I directed it.
