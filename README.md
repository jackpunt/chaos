# Chaos

## Explainer

[Choas Order](https://docs.google.com/document/d/1233l5BVtKD-KcAcVPqyA4bgy-h6HGWJapEH6uSzNb4E/) Google Docs

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 20.3.1.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4215/`. The application will automatically reload whenever you modify any of the source files.

Tell angular.json to use: architect.build.defaultConfiguration: "development"

That gets optimization: "false" so vite will not rewrite & break the sourcemap.

## Single file image, ready to run:

View and download [this Google Drive file](https://drive.google.com/file/d/1Hn5uczmDzhxmq8bJLgXx6IWjCHJgOJCK/view), saving it locally as chaos.html;  
Then click that file to open it in Chrome.

Open the devtools console to see various status, logging and warnings.  
(Cmd-Option-I in chrome; or Debug Console in vscode)

### The map
Each hex Region allocates space for Faction presence; a small hex that counts the number of Fighers
and a row for Leaders/Rhy-zu for that Faction. There is a row at the bottom for the Foundations and Buildings in the Region, and the Production Token above that.

Terrain:
* grey: potential Base Regions
* blue: lakes
* green: swamps
* brown: plains
* yellow: cliffs

### Scroll and Zoom
Left-press (on a non-placeable graphic) and drag the entire table in the view.

mouse wheel will zoom in/out around the point of the mouse cursor.

### Moving the pieces

Generally, left-press and drag the graphic, releasing over the drop target; or left-click and drag the click again over the drop target.

The gui will generally highlight the legal target locations, and shade the current drop target.

### Counters and other "cheats"

Left-click a counter (energy, gems, recruits, movePoints) to increment the counter.  
Ctrl Left-click to decrement. Shift to incr/decr by 10.

Holding down shift before clicking to move will generally override some move/placement constraints.

### other keyboard bindings
* t - show/hide Region labels (coordinates)
* c - recache some graphics
* esc - if click does not drop, esc should drop & reset
  
If you are in the source code, search for KeyBinder.keyBinder to find other key-driven actions.

### Advancing through turns & Phases

In lower-right of the central 'neutral' or 'research' panel is a button indicating the current Phase and current Player.  Click that will end the Player's turn and proceed to the next Player or Phase.

If the Player has multiple actions in a turn there may be buttons and counters on the Player's panel.

### PlaceBase Phase:
Drag and drop the Faction's Base to one of the grey Regions. If there are more than two adjacent land Regions then buttong will appear allowing you to choose which pair of Regions to use, a mountain will be placed to block the other Regions from the Base. 

One Fighter is placed in each of the Regions adjacent to the Base, and the initial Foundatations are also placed (randomly) in those Regions. After the Relics are placed each Player places a Leader and the remaining Fighters.

### PlaceRelics Phase:

To avoid extremely fortuitous/unbalanced placement of the Relics, 
each player (in reverse turn order: CCW from the gun) places one Relic of their choice on the map.  
Constraint: may not place the Relic adjacent to their initial Units.
(which are on the two Regions adjacent to their Base)

Generally two approaches: place the highest number Relic in the far away Region you would not be getting to.
Place Relic 1 between the two Factions you want to see fighting over it (so they don't harass you in Round 1).
Also: maybe ensure that Relic-5 and Relic-6 are not adjacent.

After those are placed, the rest (along with any neutral Foundations) are placed randomly on the remaining open Regions. 

If you want them all to be placed randomly (per original rules) just click the "Done" button for each Faction.

### Tactics Cards

Each player board has a 'Cards' button that exposes the player's cards.
To draw a card from the deck click and drag to the card panel.

During Combat, a panel representing the BattleWheel will appear on the player board;
drag a card to it (or not) and click the top section to select the 'wheel' sector to use.

### Leaders
The small/square icon represents the standee; drag and drop to place or move it.
Right click the Leader card for an enlarged view, left click to dismiss it.

### Unit movement

When you have movement points, a small hexagon appears over the figher count on hexes where you have presence.
Dragging that hex to an adjacent hex consumes a move-point and enables two actions: 
1. click the hexagonal 'move-button' to move Fighters to that adjacent hex (right click to undo a Fighter move)
2. drag a Leader to the adjacent hex (drag them back to undo)

Press or click to drag the dropship, legal edges are highlighted.
Units in the Circadian base can be moved to the hexes adjacent to the dropship (per above)

For Leyrien, swamps are adjanct, the hex move button will highlight them. 
As above, click the Fighter 'move-button' to increment or decrement the number of Fighters to move.

If there are tunnels, the same feature allows to drag the move-hexagon to the other end.

