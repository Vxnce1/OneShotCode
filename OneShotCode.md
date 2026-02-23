FLUX RUNNER – ULTIMATE MASTER SPECIFICATION
We are trying to vibe code a game very similar to geometry dash with one prompt to learn how to articulate and cover all possible scenarios our game has to offer.
Create a complete browser-based game called “Flux Runner” using p5.js and p5.sound. HTML, CSS, and JS
The game must be fully playable, polished, modular, deterministic where required, and logically consistent. No placeholder logic. No missing systems. No undefined variables. No contradictory mechanics.
The game is a minimalist neon rhythm-based infinite runner inspired by Geometry Dash.
WEB BROWSER TECHNICALITIES
Use only p5.js and p5.sound.
All movement and timers must use deltaTime
Clamp deltaTime to a maximum of 50ms per frame to prevent tunneling
All entities must be class-based
No gameplay logic inside UI classes.
No UI logic inside gameplay classes
Use object pooling for obstacles, coins, portals, and particles
Reset pooled objects fully before reuse
Prevent memory leaks
Support window resizing safely
Desktop keyboard only no mobile touch support required
Maintain stable FPS.
COORDINATE SYSTEM
Fixed world coordinate system
Normal gravity: ground at bottom of screen
Flipped gravity: gravity direction reverses, coordinate system does NOT rotate
Ground and ceiling positions recalculate on window resize
The player remains horizontally centered; world scrolls left.
LOGIC
Define physics constants clearly:
Gravity acceleration constant
Initial jump velocity constant
Terminal velocity cap
Jump height must be derived mathematically from gravity and initial velocity
Max jump height stored as computed variable
MapGenerator must reference the computed maxJumpHeight
All physics is deterministic.
Movement
Horizontal speed constant per difficulty
Speed changes only via speed portals
Speed increases over time only until defined cap per difficulty
After cap, difficulty plateaus.
Collision order:
Apply gravity.


Update position.


Perform collision detection.


Trigger game over BEFORE position correction if spike or side collision.


Resolve platform landing only if no lethal collision occurs.


Anti-tunneling
Use swept collision or subdivided checks at high speed.
GAME STATES
Implement strict state control:
LOADING
MENU
SHOP
CUSTOMIZATION
TUTORIAL
PLAYING_SINGLE
PLAYING_MULTI
PAUSED
GAMEOVER
Only one state is active at a time.
On state change
Clear input buffers
Reset grounded flags
Clear temporary timers.
LOADING:
Display loading screen until assets and audio are ready.
Main gameplay has no win condition.
The only termination state is death.
Tutorial is the only finite scripted mode.
PLAYER SYSTEM
Player auto-moves horizontally but stays centered similar to geometry dash
Controls:
Single Player:
 W or Space
Multiplayer:
 Top player: W
 Bottom player: Up Arrow
Jump rules:
Constant jump height.
No double jump.
Must be grounded before the next jump.
Holding the key allows continuous jumps.
100ms coyote time.
100ms input buffer.
Prevent infinite bounce exploits.
Hitbox
Constant rectangle
5 percent forgiveness shrink
Visual rotation does NOT affect hitbox.
Shapes:
Circle
Square
X
All share an identical hitbox.

Rotation
Square and X rotate 90 degrees clockwise per jump
Smooth rotation when landing from elevation
If gravity flipped, rotate counterclockwise
Reset rotation to 0 degrees on restart.
MULTIPLAYER
Screen split horizontally.
Each half has an independent UI overlay.
Single pause button pauses both players.
Same obstacle seed.
Independent physics states.
Independent gravity states.
Shared timer.
If either player dies, the game ends.
Seed rules:
Generate random seed at run start.
Use deterministic seeded random generators.
No Math.random outside seeded system.
DIFFICULTY SYSTEM
Easy:
Slow speed
Low density
Wide platforms
Medium:
Moderate speed
Moderate density
Hard:
Fast but playable
Higher density
More gravity portals
Difficulty affects:
Speed
Obstacle spacing
Gap width
Portal frequency

Scaling:
Gradual increase over time.
Hard cap per difficulty.
No infinite scaling.
MAP GENERATION
Infinite procedural generation using predefined validated segments.
Rules:
Never exceed max jump height.
Never exceed max jump distance.
Always one clear valid path.
No stacked unfair obstacles.
Safe zones before and after portals.
No gravity portal directly into the ceiling spike.
Minimum portal spacing
Only one portal per segment
No overlapping portal types.
Segment stitching must ensure vertical continuity.
Ensure a safe landing surface after gravity flip.
Clean up off-screen segments.
Tutorial uses fixed scripted layout only.
OBSTACLES
Types:
Flat platforms
Elevated platforms
Gaps
Rectangular blocks
Pillars
Triangular spikes (floor)
Ceiling spikes
Moving platforms (predictable oscillation only)
All obstacles:
Black fill
White outline
Spike hitboxes must be triangular.



SPECIAL MECHANICS
Gravity Portal:
On overlap, queue gravity changes.
Apply gravity change at the start of the next physics step
Always spawn a revert portal later.
Speed Portal:
Slow
Normal
Fast
Smooth interpolation.
Jump Pads:
Auto-trigger jump.
Multiple strengths.
Jump Rings:
Must press jump while overlapping.



RHYTHM SYSTEM
Use p5.sound techno loop.
Single audio instance only.
No overlapping playback
Define BPM
Align obstacle spacing to beat the grid
Subtle beat pulse
Subtle background glow pulse
Landing ripple
Music starts on gameplay
Pause resumes from the same timestamp
Restart resets music to beginning
Volume slider 0 to 1
Volume persists via localStorage
Volume 0 fully mutes.
VISUAL SYSTEM
Minimalist neon style.
Background:
Smooth gradient
Subtle periodic neon color transitions
Parallax layers.
Effects
Player trail
Jump particles burst
Subtle screen shake on death world layer only
0.5 second slow motion visual effect on death
Freeze physics immediately on collision
Neon glitch before Game Over UI.
Render order:
Background
Parallax
Obstacles
Coins
Player
Particles
UI
Particles must not cover UI.
SCORE SYSTEM
Display top right:
Score
High score
Time alive
Progress percentage

Progress percentage:
Distance survived relative to difficulty milestones
Single and multiplayer scores stored separately.
Game Over screen:
Current score
High score
Restart
Main menu
COIN SYSTEM
Small coins
Rare large coins
Rules:
 • Validate placement before spawn.
 • Never spawn inside obstacles.
 • Never impossible to collect.
 • Prevent double collection.
 • Persist coin total.
 • Prevent overflow.
Define fixed price tiers for shops.
SHOP SYSTEM
• Locked shapes show lock overlay.
 • Display price.
 • Prevent purchase without sufficient coins.
 • Confirmation popup.
 • Remove lock after purchase.
 • Prevent double purchase.
 • Mark equipped.
CUSTOMIZATION
Separate screen.
Left:
Color palette (no black, no white).
Center:
Live preview.
Bottom:
 Shape selection with checkbox indicator.
Persist:
 Selected shape
 Selected color
Stored in localStorage.
Back arrow bottom right.
Customization logic is separate from gameplay.

PAUSE SYSTEM
Pause button top right.
On pause:
 Grey overlay
 Large play button
 Restart
 Main menu
 Music slider
Freeze:
 Physics
 Map generation
 Particles
 Timers
Restart must:
 Clear obstacles
 Clear portals
 Clear particles
 Reset generator
 Reset timers
 Reset beat timer
 Reset rotation
 Reset gravity
 Reset input buffers
Debounce buttons 200ms. //to offset the delay
TUTORIAL
Button bottom left.
If not completed:
 Popup asking to play tutorial.
Tutorial:
 Fixed scripted level.
 Teach jump.
 Teach hold jump.
 Teach pillars.
 Teach ceiling spikes.
 Short free run.
Mark tutorialComplete only after full success.
On death:
 Return to the main menu.
SAVE SYSTEM
Use localStorage to persist:
Single high score
 Multiplayer high score
 Coins
 Purchased shapes
 Selected shape
 Selected color
 Volume
 Tutorial completion
Load safely with defaults if missing.
EDGE CASE HANDLING
Handle safely:
Jump pressed during pause
 Holding jump during restart
 Jump at portal boundary
 Gravity flip mid-air
 Restart during portal transition
 Window resize
 Volume zero
 Multiplayer mid-air death
 Exit to menu mid-run
 No input carry-over between states
 Prevent double button execution
Generate complete working p5.js code implementing every system above.
All systems must integrate seamlessly.
 No undefined behavior.
 No missing features.
 Fully playable immediately.

ISSUES
Running into obstacles does not bring up the game over screen with replay and back to the main menu buttons.
The object is able to hit the side of the platforms and glitch under the map. Fix it by triggering the game over screen.
Game over screen is missing
Replay, volume slider, and main menu buttons do not appear when paused.
Tutorial mode is missing
Customization of object is missing
2 player game mode is missing
When in settings, clicking on the outside area does not bring back to main menu screen
Display the amount of coins obtained
The object is moving through obstacles, and is moving under the map. If the object’s movement is halted or is underneath the map, trigger game over 
Remove portal feature, do not orientate the map 180 degrees
Coins and portals sometimes appear inside the obstacles, space them out.
The triangular spikes are not aligned with the platforms, are overlapping and hovering over them. Space them out.
Level difficulty is not working. It is stuck on medium level and unable to access easy or hard
Remove the flashing and visual cues as it does not sync with the gameplay
Change the music/audio into something more techno and catchy

Font and UI should be similar to geometry dash
Some pillars are too high, the object appears to be going through the pillars
Polish up the collision detection

High, score statistics should be together and not separate—counting the amount of coins obtained is the high score per run
No visual of automatic boost jump

The object does not rotate degrees smoothly.

