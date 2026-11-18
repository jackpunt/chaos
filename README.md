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

View and download [this Google Drive file](https://drive.google.com/file/d/1Hn5uczmDzhxmq8bJLgXx6IWjCHJgOJCK/view), saving it locally as chaos.html; Then click that file to open it in Chrome.

## PlaceRelics phase:

To avoid extremely fortuitous/unbalanced placement of the Relics, 
each player (in reverse turn order: CCW from the gun) places one Relic of their choice on the map.
Constraint: may not place the Relic adjacent to their initial Units.
(which are on the two Regions adjacent to their Base)

Generally two approaches: place the highest number Relic in the far away Region you would not be getting to.
Place Relic 1 between the two Factions you want to see fighting over it (so they don't harass you in Round 1).
Also: maybe ensure that Relic-5 and Relic-6 are not adjacent.

After those are placed, the rest (along with any neutral Foundations) are placed randomly on the remaining open Regions. 

If you want them all to be placed randomly (per original rules) just click the "Done" button for each Faction.

## Moving the pieces

Generally, left-press and drag the graphic, releasing over the drop target; or left-click and drag the click again over the drop target.

The gui will generally highlight the legal target locations, and shade the current drop target.

## Tactics Cards

Each player board has a 'Cards' button that exposes the player's cards.
To draw a card from the deck click and drag to the card panel.

During Combat, a panel representing the BattleWheel will appear on the player board;
drag a card to it (or not) and click the top section to select the 'wheel' sector to use.

## Leaders
The small/square icon represents the standee; drag and drop to place or move it.
Right click the Leader card for an enlarged view, left click to dismiss it.

## Unit movement

When you have movement points, a small hexagon appears over the figher count on hexes where you have presence.
Dragging that hex to an adjacent hex consumes a move-point and enables two actions: 
1. click the hex move-button to move Fighters to that adjacent hex (right click to undo a Fighter move)
2. drag a leader to the adjacent hex (drag them back to undo)

Press or click to drag the dropship, legal edges are highlighted.
Units in the Circadian base can be moved to the hexes adjacent to the dropship (per above)

For Leyrien, swamps are adjanct, the hex move button will highlight them.

If there are tunnels, the same feature allows to drag the move-hexagon to the other end.

