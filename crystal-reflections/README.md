# Crystal Reflections

A Three.js visualization featuring a highly detailed 3D crystal structure with transparent, reflective surfaces. The crystal rotates slowly, refracting light and producing rainbow-like reflections.

![Crystal Reflections](preview.png)

## Features

- **Detailed Crystal Structure**: Intricately modeled crystal with random fragments and facets
- **Advanced Transparency**: Physically-based refraction and reflection with accurate light behavior
- **Rainbow Light Effects**: Dynamic color shifts and light dispersion through the crystal
- **Realistic Lighting**: Multiple colored light sources that orbit the crystal
- **Bloom Effects**: Subtle glow that enhances the crystal's ethereal quality

## Technologies Used

- Three.js for 3D rendering
- Custom shader materials for reflections and refractions
- Physically-based rendering (PBR) for realistic light interaction
- Post-processing effects for enhanced visual quality

## How to Run

1. Open the `crystal-reflections.html` file in your browser (requires a local server)
2. Alternatively, serve the project using a local web server. For example:
   - With Node.js: `npx serve` (requires Node.js installed)
   - With Python: `python -m http.server` (Python 3) or `python -m SimpleHTTPServer` (Python 2)
3. Open your browser and navigate to the local server address (typically http://localhost:8000 or similar)

## Controls

- **Left-click + drag**: Rotate the camera around the crystal
- **Right-click + drag**: Pan the camera
- **Scroll**: Zoom in/out

## Customization

You can customize the visualization by modifying parameters in the JavaScript code:

- Adjust the `crystalParams` object to change crystal properties:
  - `facets`, `height`, `radius`, `segments`: Change the crystal geometry
  - `roughness`, `metalness`, `transmission`, `ior`: Adjust material properties
  - `autoRotate`, `rotationSpeed`: Control crystal rotation
  - `enableRainbow`, `rainbowSpeed`: Configure color transitions
  - `distortion`: Change crystal shape irregularity
  - `bloomStrength`, `bloomRadius`, `bloomThreshold`: Customize glow effects 