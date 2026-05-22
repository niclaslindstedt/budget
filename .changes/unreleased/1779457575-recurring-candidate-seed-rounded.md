---
type: Fixed
---

Promoting a recurring candidate from the history panel now seeds the
amount as a whole number. Previously a utility bill that averaged
something like 321.333… kr filled the promote modal with the full
floating-point tail; the seed is now rounded to the nearest integer
so the modal opens with a clean value the user can keep or edit.
