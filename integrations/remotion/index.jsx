import React from 'react';
import {Composition,registerRoot} from 'remotion';
import {PersonaVertical} from './PersonaVertical.jsx';
import handoff from './remotion-handoff.json';
const Root=()=> <Composition id="PersonaVertical" component={PersonaVertical}
 durationInFrames={handoff.composition.durationInFrames}
 fps={handoff.composition.fps} width={handoff.composition.width}
 height={handoff.composition.height} defaultProps={{handoff}}/>;
registerRoot(Root);
