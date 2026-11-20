# Messplan: Rechnung gegen das Spiel prüfen

Ziel: Die Größenordnungen der Rechnung im Spiel nachmessen. Die Zurechnung im Tool bleibt, wie sie ist (Splitterwaffe zählt beim Helden, der sie wirkt). Geprüft wird nur, ob die Beträge stimmen.

## Grundgedanke

Die Toolbox sieht nur Schadenszahlen von Gruppenmitgliedern. Diener, Geister und Degeneration sieht sie nicht, und wem sie Verstärkungen zurechnet, ist unbekannt. Deshalb werden keine Anteile übernommen, sondern Unterschiede gemessen:

- Immer dieselben Gegnergruppen. Deren Lebenspunkte sind fest, also ist die Zeit bis zum letzten Kill das Maß für den Teamschaden.
- Pro Lauf genau eine Änderung. Was sich an Zeit und sichtbarem Schaden ändert, ist der echte Beitrag dieser einen Sache, egal wem die Toolbox ihn zurechnet.
- Sinkt der sichtbare Gesamtschaden bei gleichen Gegnern, hat eine unsichtbare Quelle (Diener, Geister, Degeneration) den Rest erledigt.

## Stufe 1: Insel der Namenlosen, Meister des Schadens

Messstand laut Wiki: Stufe 20, Rüstung 60, greift nicht an, nennt nach `/bow` Gesamtschaden, Zeit und Schaden pro Sekunde, Lebensraub und Degeneration eingeschlossen. Die normale Insel nutzt PvE-Fassungen der Fertigkeiten. Im Tool dazu 1 Ziel und Rüstung 60 einstellen. Ohne Conset und ohne andere Verbrauchsgüter.

Läufe: Spieler allein, Spieler mit Geister-Ritualist (mit und ohne Splitterwaffe, Stärke der Ehre, Einblick des Richters), Geister-Ritualist allein. Grenzen: keine Auslöser durch Gegneraktionen, keine Leichen, nur ein Ziel. Beim ersten Versuch klären: Zählt er Helden und Geister mit, und darf das volle Heldenteam mit?

## Stufe 2: Strecke im Feld

Tahnnakai-Tempel im Hardmode, die ersten drei Gruppen (stehen laut L bei jedem Start gleich). Jede Gruppe einzeln ziehen, nichts zusammenlaufen lassen, Gruppe bleibt in Kompassreichweite. Team: Derwisch mit Pious Renewal, Geister-Ritualist mit Splitterwaffe, Zwietracht-Nekromant mit Knochenteufel, zwei Energiewelle-Mesmer, ein dritter Mesmer, Schmerz-der-Entzauberung-Nekromant, Blut-ist-Kraft-Heiler. Ohne Conset.

## Pro Lauf festhalten

1. `/dmg reset` vor dem ersten Treffer, `/dmg report` nach dem letzten Kill (Text oder Screenshot).
2. Zeit vom ersten Treffer bis zum letzten Kill in Sekunden.
3. Zahl der getöteten Gegner und ob jemand gestorben ist.
4. Einmalig: Codes des Teams aus „Teilen", Einstellung für Ziele und Rüstung im Tool.

## Läufe

| Nr. | Lauf | Was er zeigt |
|---|---|---|
| 1 bis 3 | Unverändert, dreimal | Wie stark Zeit und Anteile von allein schwanken. Ohne das ist kein Unterschied deutbar. |
| 4 | Splitterwaffe, Stärke der Ehre und Einblick des Richters aus | Echter Beitrag der Verstärkungen auf den Nahkämpfer |
| 5 | Knochenteufel beleben beim Zwietracht-Nekromanten aus | Echter Beitrag der Diener |
| 6 | Siegel der Geister aus | Echter Beitrag der Geister |
| 7 | Ein Energiewelle-Mesmer bleibt per Flagge weit hinten | Echter Beitrag eines Mesmers samt Kontrolle |

## Auswertung

Für jeden Lauf 4 bis 7 sagt das Tool vorher, um wie viel Prozent der Teamschaden sinkt. Gemessen wird, um wie viel Prozent die Zeit steigt. Angepasst wird die Rechnung nur, wenn die Abweichung größer ist als die Schwankung aus den Läufen 1 bis 3. Zusätzlich: Der Wert „Heal" im Report geteilt durch die Zeit gegen die Heilung/s im Tool.
