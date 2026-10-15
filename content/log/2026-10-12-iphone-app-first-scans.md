---
title: An iPhone scanning app, and the first real scans
date: 2026-10-12
project: foot-scanner
draft: true
---

<!-- DRAFT from the footscan git history (11-12 Oct 2026: the LiDAR test app, the
     studio scoring imported calibration-object models, "Send scans from the iPhone
     app straight to the studio", the first real scans). Brandon: check it, say how
     much an AI agent wrote, then delete this comment and `draft: true`. -->

Moved capture onto the phone. An iPhone app now builds the 3D model on the phone
itself, using Apple's Object Capture and the LiDAR sensor, and sends it straight
to the scanner's studio on the computer.

Then the first real scans: the calibration object, which the studio scores
against its known size, and a shoe. The first real scan also led to changes in
the app, and to reading the phone's models as plain geometry.
