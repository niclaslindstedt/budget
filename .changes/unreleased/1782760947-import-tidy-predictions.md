---
type: Changed
title: Imports tidy up past-due predictions
---

Importing bank history now moves a predicted entry that never posted past the latest imported transaction (it can't happen in the past), and merges a transaction that posted a few days early with its prediction instead of leaving two rows for the same thing.
