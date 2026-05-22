---
type: Fixed
---

Tapping outside an active editor on the sheet — entry-type picker,
category picker, backend picker, description popover, the amount
input, the desktop description textarea — now only dismisses it,
regardless of where the tap lands. Previously a tap on another cell
in the same row, or on another input inside the same modal, would
both dismiss the editor AND focus the input / activate the cell
beneath the tap; on iOS the keyboard would even pop up under the
next input mid-dismiss.
