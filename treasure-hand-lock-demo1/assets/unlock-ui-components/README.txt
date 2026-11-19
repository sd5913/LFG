Chest gesture-unlock UI component pack

Canvas: 1672 x 941. All runtime pieces are transparent PNGs unless noted otherwise.

Layer order:
1. backgrounds/ui_static_shell.png
2. top progress nodes + optional state overlays
3. live camera/video inside the left frame (crop area 97,323,372,600)
4. right target gesture icon + rotation arrow
5. dial/dial_rotor.png (rotate around its image centre), then dial_hub_keyhole.png and dial_pointer.png
6. lower progress fill and one token per step

States: use gestures/gesture_selection_frame.png for current step; put gestures/gesture_completed_check.png near a completed top node. Bottom tokens have idle, selected and completed variants. The current user hand should be live video in the left panel, not a pre-rendered sprite.
