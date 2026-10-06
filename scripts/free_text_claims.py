"""Free-text claims used to keep the Try-it page honest (written for the 2026 revival).

The web app searches a pruned evidence index, not all 1.19M passages. Two lists here
check what that costs:

* ``EXAMPLES`` are the one-click examples on the Try-it page. ``build_retrieval.py``
  runs each one over the FULL corpus and adds every passage it could select to the
  pruned index, so the site returns exactly what the 2024 system would. The note
  shown under each example is checked against that full-corpus run by
  ``build_web_data.py`` (``expect``), so an example can never misdescribe the
  original system.
* ``HELDOUT`` claims are NOT used to build the index. They measure how often the
  pruned index picks the same passages as the full corpus for claims nobody planned
  for. The agreement rate is stored in ``climate.db`` and shown on the Try-it and
  Method pages; a vitest case re-derives it with the TypeScript port.

None of these sentences comes from the course data.
"""

from __future__ import annotations

# note: shown on the site; expect: properties asserted against the full-corpus run
# (submission rule): "gold" = a selected passage is gold evidence for a train/dev claim,
# "no_gold" = none is, "filtered" / "fallback" = the selection path.
EXAMPLES: list[dict] = [
    {"text": "Arctic sea ice has been shrinking for decades.", "note": "finds a gold passage",
     "expect": ["gold", "filtered"]},
    {"text": "Antarctica is gaining ice, not losing it.", "note": "finds a gold passage",
     "expect": ["gold", "filtered"]},
    {"text": "Carbon dioxide is a trace gas, so it cannot warm the planet.", "note": "on topic, no gold",
     "expect": ["no_gold", "filtered"]},
    {"text": "[South Australia] has the most expensive electricity in the world.", "note": "a dev claim",
     "expect": ["gold", "filtered"]},
    {"text": "Wind turbines kill millions of birds every year.", "note": "matches words, not meaning",
     "expect": ["no_gold", "filtered"]},
    {"text": "The Great Barrier Reef is in better shape than ever.", "note": "a telling miss",
     "expect": ["no_gold", "filtered"]},
    {"text": "Climate scientists are in it for the grant money.", "note": "fallback path",
     "expect": ["no_gold", "fallback"]},
]

HELDOUT: list[str] = [
    "Volcanoes emit more CO2 than humans.",
    "Hurricanes are getting stronger because of climate change.",
    "Sea levels are rising faster than ever",
    "Global warming stopped in 1998.",
    "Polar bear populations are increasing.",
    "The sun is causing global warming.",
    "Climate models have failed to predict the observed warming.",
    "Renewable energy is more expensive than coal.",
    "Methane is a more potent greenhouse gas than carbon dioxide.",
    "Glaciers around the world are retreating.",
    "Ocean acidification is harming coral reefs.",
    "There is no scientific consensus on climate change.",
    "The Medieval Warm Period was warmer than today.",
    "CO2 is plant food, so more of it is good for crops.",
    "Electric cars produce more emissions than petrol cars.",
    "Australia's bushfires were caused by arsonists, not climate change.",
    "Droughts are becoming more frequent in Africa.",
    "The ozone hole causes global warming.",
    "Water vapour is the most important greenhouse gas.",
    "Nuclear power produces no carbon emissions.",
    "Deforestation in the Amazon releases huge amounts of carbon.",
    "Greenland's ice sheet is melting at an accelerating rate.",
    "Extreme heatwaves have become more common since the 1950s.",
    "Cosmic rays control the Earth's climate.",
    "The Paris Agreement aims to limit warming to 1.5 degrees.",
    "Solar panels take more energy to make than they ever produce.",
    "Permafrost thaw could release large amounts of methane.",
    "The Gulf Stream is slowing down.",
    "China emits more carbon dioxide than any other country.",
    "Snowfall in winter proves global warming is a hoax.",
    "Temperatures were higher during the time of the dinosaurs.",
    "Human activity is responsible for most of the recent warming.",
    "Sea ice in the Antarctic reached a record low.",
    "Coal power plants are the largest source of carbon emissions in the US.",
    "Climate change will cause mass extinction of species.",
    "Tropical cyclones are becoming less frequent.",
    "Rising temperatures increase the spread of malaria.",
    "Wildfires in California are linked to climate change.",
    "The Little Ice Age ended because of solar activity.",
    "El Nino caused the record temperatures of 2016.",
    "Carbon taxes have reduced emissions in British Columbia.",
    "Planting trees can offset all fossil fuel emissions.",
    "Ice cores show CO2 lagged temperature in past climate changes.",
    "The Netherlands is at risk from rising sea levels.",
    "Earth has been cooling since 2016.",
    "Atmospheric CO2 has passed 400 parts per million.",
    "Climate change is making floods worse in Pakistan.",
    "The hockey stick graph has been debunked.",
    "Satellite data show no warming in the lower troposphere.",
    "Agriculture is a major source of nitrous oxide emissions.",
    "Cows produce large amounts of methane.",
    "Kilimanjaro's snow is disappearing because of global warming.",
    "Pacific island nations are threatened by rising seas.",
    "Global temperatures have risen by about one degree since pre-industrial times.",
    "Urban heat islands explain the warming trend in thermometer records.",
    "Coral bleaching events are becoming more frequent.",
    "The Arctic is warming twice as fast as the rest of the world.",
    "Natural cycles explain the current warming.",
    "Fossil fuels supply most of the world's energy.",
    "Hydropower is a renewable energy source.",
]

assert not {e["text"] for e in EXAMPLES} & set(HELDOUT), "examples must not be held out"
assert len(set(HELDOUT)) == len(HELDOUT)
