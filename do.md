how often are u refreshing data like weather?

shouldnt u have temp in f and not c? also same for km/h

i thought we removed photo upload no? cuz we looking proactive and not reactive? 

A small trained forecast model plus an evaluation. You already have scripts that pull archived weather and NWS warnings for past days. Use them to build training data across many past days, then train something simple (logistic regression or gradient boosting) that predicts the chance of a STOP-WORK warning at a site tomorrow. Report how well it does on days it wasn't trained on, and show "model probability" next to the rule-based call. This answers both Sperry's ML requirement and the AI track.
