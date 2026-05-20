---
type: Changed
---

Plain text inputs in modals (descriptions, names, search and rename
fields, …) no longer select all on focus. Tapping a long pre-filled
description on mobile to wipe it would pop the soft keyboard before
the user had decided what to do, which jolted the modal layout and
buried the field they meant to look at. Each text input now carries
an inline × button that clears the value in one tap without opening
the keyboard. Amount and other numeric inputs still select on focus
so a fast retype works as before, and the inline description /
amount editors in the sheet are unchanged.
