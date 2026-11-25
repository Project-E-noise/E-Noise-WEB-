# Note for the paper: role of the YAMNet classifier

Use this in the methodology section and in defense answers. It replaces earlier
wording that called classification "supplementary only."

---

**Revised wording (paste-ready)**

E-Noise uses a two-stage decision. In the first stage, the sensor node's sound level
acts as a trigger. When a table's level stays at or above its critical threshold for
the configured duration (10 seconds by default), the system treats it as a candidate
event. Short dips of up to 2 seconds are tolerated. Loudness alone does not make the
event a violation.

In the second stage, the event is verified by classifying its sound. While the event
lasts, the node sends short audio clips (one at the start, then every 5 seconds) to a
classifier based on Google's pretrained YAMNet model. The clips are processed in memory
and never stored. The classifier maps YAMNet's 521 AudioSet classes to five categories:
Loud Conversation, Mobile Phone Noise, Music, Impact Noise and Ambient Baseline. Only the
first three are defined as violation sounds.

An event is confirmed as a violation only when most of the confident labels (at least
50% confidence) fall in a violation category. Only then does the critical indicator
light and the occupant receive a strike. A tie is not a violation. Every other loud
event is logged for administrator review without a strike, either as "ignored" (for
example a door slam, a cough, typing or air-conditioning noise) or as "unverified"
(when no confident label was available). An administrator can confirm a reviewed event
as a violation manually. To prevent continuous noise from producing a ban within
minutes, an occupant can receive at most one strike per day.

Classification is therefore part of the violation decision, not a supplementary
annotation. It verifies the dB-triggered event and decides whether that event counts.

**Limitations to state with it**

- The decibel values are estimates from an uncalibrated microphone until bench
  calibration against a sound level meter is completed.
- The mapping from YAMNet classes to the five categories is hand-authored and has not
  yet been validated on labeled recordings from the study hub. The 50% confidence
  threshold is a starting value to be tuned with those recordings.
- YAMNet was trained on general AudioSet audio, not on tabletop sound captured through
  a MAX9814 microphone, so accuracy in the study hub must be measured before results
  are reported as precision and recall.

**Short defense answer**

"The decibel reading only tells us something is loud. The classifier tells us what it
is. A loud event becomes a violation only if the classifier says it was conversation,
a phone or music. A door slam or a cough is logged for review but never counts against
a student."
