import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// Global variables
let scene, camera, renderer, composer, controls;
let waveform, waveformMesh;
let analyser, audioSource, audioContext, audioData;
let raycaster, mouse;
let clock = new THREE.Clock();
let plane; // Reference to an invisible plane for raycasting

// Parameters for wave visualization
const params = {
    // Shape parameters
    size: 2.5,
    resolution: 128,
    amplitude: 0.5,
    frequency: 0.5,
    
    // Color parameters
    colorSpeed: 0.5,
    hueRange: [0.5, 0.85], // Blue to Red in HSL (0.5-0.85)
    saturation: 0.8,
    lightness: 0.5,
    
    // Animation parameters
    waveSpeed: 0.5,
    noiseScale: 4.0,
    
    // Interaction
    enableAudio: false,
    enableMouseReactivity: true,
    
    // Visual effects
    bloomStrength: 0.5,
    bloomRadius: 0.3,
    bloomThreshold: 0.2
};

// Initialize the scene
function init() {
    // Create the scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    
    // Set up camera
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 5);
    
    // Set up renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.body.appendChild(renderer.domElement);
    
    // Set up raycaster for mouse interaction
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
    
    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0x333333);
    scene.add(ambientLight);
    
    // Add directional light
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);
    
    // Create wave geometry
    createWaveform();
    
    // Create an invisible plane for mouse interaction - larger than the wave mesh
    createInteractionPlane();
    
    // Set up audio context for audio reactivity
    setupAudio();
    
    // Set up post-processing
    setupPostProcessing();
    
    // Set up event listeners
    setupEventListeners();
    
    // Set up controls - IMPORTANT: this must come after adding the renderer to the DOM
    setupControls();
    
    // Handle window resize
    window.addEventListener('resize', onWindowResize);
    
    // Animate
    animate();
    
    // Log for debugging
    console.log("Wave Visualizer initialized");
}

// Set up OrbitControls
function setupControls() {
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxDistance = 20;
    controls.minDistance = 2;
    
    // Limit rotation to prevent extreme angles
    controls.minPolarAngle = Math.PI * 0.1; // Limit bottom rotation
    controls.maxPolarAngle = Math.PI * 0.9; // Limit top rotation
    
    // Log for debugging
    console.log("OrbitControls initialized");
}

// Create the wave geometry
function createWaveform() {
    // Create a geometry that will be deformed by the shaders
    const geometry = new THREE.PlaneGeometry(
        params.size * 2,
        params.size * 2,
        params.resolution,
        params.resolution
    );
    
    // Create an empty audio data texture to prevent shader errors
    const emptyAudioData = new Uint8Array(128).fill(0);
    const audioDataTexture = new THREE.DataTexture(
        emptyAudioData,
        128,
        1,
        THREE.RedFormat,
        THREE.UnsignedByteType
    );
    audioDataTexture.needsUpdate = true;
    
    // Create the shader material for the waves
    const material = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 },
            resolution: { value: new THREE.Vector2(params.resolution, params.resolution) },
            amplitude: { value: params.amplitude },
            frequency: { value: params.frequency },
            noiseScale: { value: params.noiseScale },
            hueRange: { value: new THREE.Vector2(params.hueRange[0], params.hueRange[1]) },
            saturation: { value: params.saturation },
            lightness: { value: params.lightness },
            colorSpeed: { value: params.colorSpeed },
            mousePosition: { value: new THREE.Vector2(0, 0) },
            mouseInfluence: { value: 0.0 },
            audioData: { value: audioDataTexture },
            audioInfluence: { value: 0.0 }
        },
        vertexShader: `
            uniform float time;
            uniform vec2 resolution;
            uniform float amplitude;
            uniform float frequency;
            uniform float noiseScale;
            uniform vec2 mousePosition;
            uniform float mouseInfluence;
            uniform float audioInfluence;
            uniform sampler2D audioData;
            
            varying vec3 vPosition;
            varying vec2 vUv;
            
            // Simplex noise functions - modified from https://github.com/ashima/webgl-noise
            vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
            vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
            vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
            vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
            
            float snoise(vec3 v) {
                const vec2 C = vec2(1.0/6.0, 1.0/3.0);
                const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
                
                // First corner
                vec3 i  = floor(v + dot(v, C.yyy));
                vec3 x0 = v - i + dot(i, C.xxx);
                
                // Other corners
                vec3 g = step(x0.yzx, x0.xyz);
                vec3 l = 1.0 - g;
                vec3 i1 = min(g.xyz, l.zxy);
                vec3 i2 = max(g.xyz, l.zxy);
                
                vec3 x1 = x0 - i1 + C.xxx;
                vec3 x2 = x0 - i2 + C.yyy;
                vec3 x3 = x0 - D.yyy;
                
                // Permutations
                i = mod289(i);
                vec4 p = permute(permute(permute(
                        i.z + vec4(0.0, i1.z, i2.z, 1.0))
                        + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                        + i.x + vec4(0.0, i1.x, i2.x, 1.0));
                        
                // Gradients
                float n_ = 0.142857142857;
                vec3 ns = n_ * D.wyz - D.xzx;
                
                vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
                
                vec4 x_ = floor(j * ns.z);
                vec4 y_ = floor(j - 7.0 * x_);
                
                vec4 x = x_ *ns.x + ns.yyyy;
                vec4 y = y_ *ns.x + ns.yyyy;
                vec4 h = 1.0 - abs(x) - abs(y);
                
                vec4 b0 = vec4(x.xy, y.xy);
                vec4 b1 = vec4(x.zw, y.zw);
                
                vec4 s0 = floor(b0)*2.0 + 1.0;
                vec4 s1 = floor(b1)*2.0 + 1.0;
                vec4 sh = -step(h, vec4(0.0));
                
                vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
                vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
                
                vec3 p0 = vec3(a0.xy, h.x);
                vec3 p1 = vec3(a0.zw, h.y);
                vec3 p2 = vec3(a1.xy, h.z);
                vec3 p3 = vec3(a1.zw, h.w);
                
                // Normalise gradients
                vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
                p0 *= norm.x;
                p1 *= norm.y;
                p2 *= norm.z;
                p3 *= norm.w;
                
                // Mix final noise value
                vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
                m = m * m;
                return 42.0 * dot(m*m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
            }
            
            float computeAudioInfluence(vec2 uv) {
                // If audio is not enabled, return 0
                if (audioInfluence < 0.01) return 0.0;
                
                // Calculate distance from center
                float dist = length(uv - 0.5) * 2.0;
                
                // Sample the audio data texture
                // We use the distance to determine which frequency range to sample
                float audioValue = 0.0;
                
                // GLSL doesn't have null, so we don't need to check if audioData exists
                // It's a uniform and will always be bound to something, even if it's empty
                audioValue = texture2D(audioData, vec2(dist, 0.5)).r;
                
                return audioValue * audioInfluence;
            }
            
            void main() {
                vUv = uv;
                
                // Base wave pattern
                vec3 pos = position;
                
                // Time and position factors
                float timeFactor = time * frequency;
                vec3 noisePos = vec3(pos.x * noiseScale, pos.y * noiseScale, timeFactor);
                
                // Calculate noise value
                float noise = snoise(noisePos) * amplitude;
                
                // Calculate distance from mouse position for mouse interaction
                float mouseDistance = length(mousePosition - pos.xy);
                float mouseEffect = 0.0;
                if (mouseInfluence > 0.01) {
                    mouseEffect = (1.0 - smoothstep(0.0, 1.0, mouseDistance)) * mouseInfluence * 2.0;
                }
                
                // Calculate audio influence
                float audioEffect = computeAudioInfluence(uv);
                
                // Combine effects
                float displacement = noise + mouseEffect + audioEffect;
                
                // Apply displacement along z-axis
                pos.z += displacement;
                
                // Set the final position
                vPosition = pos;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
            }
        `,
        fragmentShader: `
            uniform float time;
            uniform vec2 hueRange;
            uniform float saturation;
            uniform float lightness;
            uniform float colorSpeed;
            
            varying vec3 vPosition;
            varying vec2 vUv;
            
            // Function to convert HSL to RGB
            vec3 hslToRgb(vec3 hsl) {
                float h = hsl.x;
                float s = hsl.y;
                float l = hsl.z;
                
                float c = (1.0 - abs(2.0 * l - 1.0)) * s;
                float x = c * (1.0 - abs(mod(h * 6.0, 2.0) - 1.0));
                float m = l - c/2.0;
                
                vec3 rgb;
                
                if (h < 1.0/6.0) rgb = vec3(c, x, 0.0);
                else if (h < 2.0/6.0) rgb = vec3(x, c, 0.0);
                else if (h < 3.0/6.0) rgb = vec3(0.0, c, x);
                else if (h < 4.0/6.0) rgb = vec3(0.0, x, c);
                else if (h < 5.0/6.0) rgb = vec3(x, 0.0, c);
                else rgb = vec3(c, 0.0, x);
                
                return rgb + m;
            }
            
            void main() {
                // Create color gradient based on position and time
                // Map the range between blue (0.5-0.7) and red (0.8-1.0)
                
                // Get height data to influence color
                float heightValue = vPosition.z;
                
                // Calculate hue based on height and time
                float timeOffset = time * colorSpeed * 0.1;
                float hue = mix(hueRange.x, hueRange.y, 
                                0.5 + 0.5 * sin(heightValue * 2.0 + timeOffset));
                
                // Use height to influence saturation and lightness
                float sat = saturation * (0.9 + 0.1 * sin(heightValue * 5.0 + time));
                float lit = lightness * (0.8 + 0.2 * cos(heightValue * 3.0));
                
                // Convert HSL to RGB
                vec3 color = hslToRgb(vec3(hue, sat, lit));
                
                // Add slight rim lighting effect
                vec3 viewDirection = normalize(cameraPosition - vPosition);
                float rimLight = 1.0 - max(dot(viewDirection, vec3(0.0, 0.0, 1.0)), 0.0);
                rimLight = pow(rimLight, 3.0);
                
                // Add glow to the edges
                color += vec3(0.5, 0.2, 0.8) * rimLight * 0.4;
                
                gl_FragColor = vec4(color, 1.0);
            }
        `,
        side: THREE.DoubleSide
    });
    
    // Create the mesh
    waveformMesh = new THREE.Mesh(geometry, material);
    scene.add(waveformMesh);
    
    // Store reference for updates
    waveform = {
        mesh: waveformMesh,
        material: material,
        geometry: geometry
    };
    
    console.log("Wave geometry created");
}

// Create an invisible plane for better mouse interaction
function createInteractionPlane() {
    // Create a larger plane for mouse interaction
    const planeGeo = new THREE.PlaneGeometry(params.size * 4, params.size * 4);
    const planeMat = new THREE.MeshBasicMaterial({ 
        visible: false,  // Make it invisible
        side: THREE.DoubleSide
    });
    plane = new THREE.Mesh(planeGeo, planeMat);
    scene.add(plane);
    
    console.log("Interaction plane created");
}

// Set up audio context and analyzer
function setupAudio() {
    try {
        // Create audio context
        window.AudioContext = window.AudioContext || window.webkitAudioContext;
        audioContext = new AudioContext();
        
        // Create analyzer
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        
        // Create buffer for frequency data
        const bufferLength = analyser.frequencyBinCount;
        audioData = new Uint8Array(bufferLength);
        
        // Update the existing texture in the material instead of creating a new one
        if (waveform && waveform.material && waveform.material.uniforms.audioData.value) {
            // Resize the existing texture if needed
            if (waveform.material.uniforms.audioData.value.image.width !== bufferLength) {
                waveform.material.uniforms.audioData.value.dispose(); // Clean up old texture
                
                const newTexture = new THREE.DataTexture(
                    audioData,
                    bufferLength,
                    1,
                    THREE.RedFormat,
                    THREE.UnsignedByteType
                );
                newTexture.needsUpdate = true;
                waveform.material.uniforms.audioData.value = newTexture;
            }
        }
        
        console.log('Audio initialized successfully');
    } catch (error) {
        console.error('Error setting up audio:', error);
    }
}

// Set up audio file input
function setupAudioFile(file) {
    if (!file || !audioContext) return;
    
    // Stop any current audio
    if (audioSource) {
        audioSource.disconnect();
    }
    
    // Read the file
    const reader = new FileReader();
    reader.onload = function(e) {
        // Decode audio data
        audioContext.decodeAudioData(e.target.result, function(buffer) {
            // Create audio source
            const source = audioContext.createBufferSource();
            source.buffer = buffer;
            source.connect(analyser);
            analyser.connect(audioContext.destination);
            
            // Play the audio
            source.loop = true;
            source.start(0);
            
            // Store reference
            audioSource = source;
            
            // Update UI state
            document.getElementById('enableAudio').checked = true;
            params.enableAudio = true;
            waveform.material.uniforms.audioInfluence.value = 1.0;
            
            console.log('Audio file loaded and playing');
            
        }, function(error) {
            console.error('Error decoding audio file:', error);
        });
    };
    
    reader.readAsArrayBuffer(file);
}

// Set up post-processing
function setupPostProcessing() {
    // Create composer
    composer = new EffectComposer(renderer);
    
    // Add render pass
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);
    
    // Add bloom pass
    const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        params.bloomStrength, 
        params.bloomRadius, 
        params.bloomThreshold
    );
    composer.addPass(bloomPass);
    
    console.log("Post-processing setup complete");
}

// Set up event listeners
function setupEventListeners() {
    // Mouse move listener for interaction
    document.addEventListener('mousemove', onMouseMove);
    
    // UI controls listeners
    document.getElementById('enableAudio').addEventListener('change', function(e) {
        params.enableAudio = e.target.checked;
        
        // If enabling audio, resume audio context
        if (params.enableAudio && audioContext && audioContext.state === 'suspended') {
            audioContext.resume();
        }
        
        // Update shader uniform
        if (waveform && waveform.material) {
            waveform.material.uniforms.audioInfluence.value = params.enableAudio ? 1.0 : 0.0;
        }
        
        console.log("Audio reactivity:", params.enableAudio);
    });
    
    document.getElementById('enableMouseReactivity').addEventListener('change', function(e) {
        params.enableMouseReactivity = e.target.checked;
        console.log("Mouse reactivity:", params.enableMouseReactivity);
    });
    
    document.getElementById('waveIntensity').addEventListener('input', function(e) {
        const value = e.target.value / 100;
        params.amplitude = value * 2.0;
        
        // Update shader uniform
        if (waveform && waveform.material) {
            waveform.material.uniforms.amplitude.value = params.amplitude;
        }
    });
    
    document.getElementById('waveSpeed').addEventListener('input', function(e) {
        const value = e.target.value / 100;
        params.waveSpeed = value * 2.0;
    });
    
    // Audio file button
    document.getElementById('audioFileButton').addEventListener('click', function() {
        document.getElementById('audioFileInput').click();
    });
    
    // Audio file input
    document.getElementById('audioFileInput').addEventListener('change', function(e) {
        if (e.target.files.length > 0) {
            const file = e.target.files[0];
            setupAudioFile(file);
        }
    });
    
    console.log("Event listeners setup complete");
}

// Handle mouse movement
function onMouseMove(event) {
    // Get mouse coordinates
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    // Only calculate intersections if mouse reactivity is enabled
    if (!params.enableMouseReactivity) {
        return;
    }
    
    // Update raycaster with mouse position
    raycaster.setFromCamera(mouse, camera);
    
    // Check for intersections with the invisible plane
    const intersects = raycaster.intersectObject(plane);
    
    if (intersects.length > 0) {
        // Get intersection point and convert to wave mesh coordinates
        const point = intersects[0].point.clone();
        // This maps the intersection point to local coordinates
        waveformMesh.worldToLocal(point);
        
        // Update shader uniform with new mouse position
        if (waveform && waveform.material) {
            waveform.material.uniforms.mousePosition.value.set(point.x, point.y);
            waveform.material.uniforms.mouseInfluence.value = 1.0;
        }
        
        // Debug coordinates
        // console.log("Mouse hit:", point.x.toFixed(2), point.y.toFixed(2));
    }
}

// Update audio data
function updateAudio() {
    if (!params.enableAudio || !analyser) return;
    
    // Get frequency data
    analyser.getByteFrequencyData(audioData);
    
    // Update texture
    if (waveform && waveform.material && waveform.material.uniforms.audioData.value) {
        waveform.material.uniforms.audioData.value.needsUpdate = true;
    }
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    
    const time = clock.getElapsedTime() * params.waveSpeed;
    
    // Update shader time uniform
    if (waveform && waveform.material) {
        waveform.material.uniforms.time.value = time;
    }
    
    // Update audio data
    updateAudio();
    
    // Update controls - this is vital for OrbitControls to work
    if (controls) {
        controls.update();
    }
    
    // Render with composer
    composer.render();
}

// Window resize handler
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
}

// Initialize the application
init(); 