import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';

// Global variables
let scene, camera, renderer, composer, controls;
let liquidMetal, targetMesh;
let morphTargets = {};
let clock = new THREE.Clock();
let envMap;

// Parameters
const params = {
    // Animation
    autoMorph: true,
    morphSpeed: 0.5,
    morphDuration: 3.0,  // seconds per shape
    currentMorphTime: 0,
    currentMorphTarget: null,
    nextMorphTarget: null,
    
    // Material
    metalColor: 'mercury',
    metalColors: {
        mercury: {
            color: new THREE.Color(0xEEEEEE),
            emissive: new THREE.Color(0x555555),
            roughness: 0.1,
            metalness: 0.9
        },
        gold: {
            color: new THREE.Color(0xFFD700),
            emissive: new THREE.Color(0x442200),
            roughness: 0.2,
            metalness: 1.0
        },
        copper: {
            color: new THREE.Color(0xE7756F),
            emissive: new THREE.Color(0x330000),
            roughness: 0.3,
            metalness: 0.8
        },
        chrome: {
            color: new THREE.Color(0xCCCCCC),
            emissive: new THREE.Color(0x111111),
            roughness: 0.0,
            metalness: 1.0
        },
        iridescent: {
            color: new THREE.Color(0xFFFFFF),
            emissive: new THREE.Color(0x000000),
            roughness: 0.2,
            metalness: 0.8
        }
    },
    
    // Morphing
    surfaceTurbulence: 0.3,
    noiseScale: 0.8,
    noiseSpeed: 0.2,
    
    // Shape
    currentShape: 'random',
    resolution: 64,  // Affects mesh detail
    
    // Visual effects
    bloomStrength: 0.2,
    bloomRadius: 0.5,
    bloomThreshold: 0.85
};

// Initialize the scene
function init() {
    // Create the scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050505);
    
    // Set up camera
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 4);
    
    // Set up renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.physicallyCorrectLights = true;
    document.body.appendChild(renderer.domElement);
    
    // Set up controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxDistance = 20;
    controls.minDistance = 2;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.5;
    
    // Load environment map for reflections
    loadEnvironmentMap();
    
    // Add lights
    setupLights();
    
    // Create morph targets
    createMorphTargets();
    
    // Create the liquid metal object
    createLiquidMetal();
    
    // Set up post-processing
    setupPostProcessing();
    
    // Set up event listeners
    setupEventListeners();
    
    // Handle window resize
    window.addEventListener('resize', onWindowResize);
    
    // Start animation
    animate();
}

// Load HDR environment map
function loadEnvironmentMap() {
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();
    
    // Create a simple environment for reflection
    const envScene = new THREE.Scene();
    
    // Create a large sphere with gradient material
    const gradientMaterial = new THREE.ShaderMaterial({
        uniforms: {
            topColor: { value: new THREE.Color(0x0066cc) },
            bottomColor: { value: new THREE.Color(0x000022) }
        },
        vertexShader: `
            varying vec3 vWorldPosition;
            void main() {
                vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                vWorldPosition = worldPosition.xyz;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 topColor;
            uniform vec3 bottomColor;
            varying vec3 vWorldPosition;
            void main() {
                float h = normalize(vWorldPosition).y * 0.5 + 0.5;
                vec3 gradientColor = mix(bottomColor, topColor, h);
                gl_FragColor = vec4(gradientColor, 1.0);
            }
        `,
        side: THREE.BackSide
    });
    
    const gradientSphere = new THREE.Mesh(
        new THREE.SphereGeometry(50, 32, 32),
        gradientMaterial
    );
    
    envScene.add(gradientSphere);
    
    // Generate the environment map
    envMap = pmremGenerator.fromScene(envScene).texture;
    scene.environment = envMap;
    
    // Clean up
    pmremGenerator.dispose();
}

// Set up scene lights
function setupLights() {
    // Ambient light
    const ambientLight = new THREE.AmbientLight(0x333333, 1);
    scene.add(ambientLight);
    
    // Main directional light
    const mainLight = new THREE.DirectionalLight(0xffffff, 1.5);
    mainLight.position.set(5, 5, 5);
    scene.add(mainLight);
    
    // Colored rim lights for more interesting reflections
    const blueLight = new THREE.PointLight(0x3366ff, 1, 20);
    blueLight.position.set(-5, 2, -3);
    scene.add(blueLight);
    
    const purpleLight = new THREE.PointLight(0xff33cc, 1, 20);
    purpleLight.position.set(5, -2, -3);
    scene.add(purpleLight);
}

// Create the target shapes for morphing
function createMorphTargets() {
    morphTargets = {
        // Basic shapes
        sphere: new THREE.SphereGeometry(1, params.resolution, params.resolution),
        torus: new THREE.TorusGeometry(0.7, 0.3, params.resolution / 2, params.resolution),
        cube: new THREE.BoxGeometry(1.5, 1.5, 1.5, params.resolution / 8, params.resolution / 8, params.resolution / 8),
        cone: new THREE.ConeGeometry(1, 2, params.resolution / 2, params.resolution / 4),
        
        // Abstract shape
        abstract: createAbstractShape()
    };
    
    // Convert geometries to BufferGeometries if they aren't already
    for (const key in morphTargets) {
        if (!(morphTargets[key] instanceof THREE.BufferGeometry)) {
            morphTargets[key] = new THREE.BufferGeometry().fromGeometry(morphTargets[key]);
        }
        
        // Ensure all geometries have the same number of vertices for morphing
        // We'll use the sphere as our base geometry
        if (key !== 'sphere') {
            normalizeGeometryVertices(morphTargets[key], morphTargets.sphere.attributes.position.count);
        }
    }
    
    params.currentMorphTarget = 'sphere';
    params.nextMorphTarget = getNextShape();
}

// Create a complex abstract shape using noise and distortion
function createAbstractShape() {
    const baseGeometry = new THREE.IcosahedronGeometry(1, 4);
    
    // Get position attribute
    const positions = baseGeometry.attributes.position;
    
    // Create noise function
    const noise = function(x, y, z) {
        return Math.sin(x * 2) * Math.cos(y * 2) * Math.sin(z * 2);
    };
    
    // Apply noise to vertices
    for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i);
        const y = positions.getY(i);
        const z = positions.getZ(i);
        
        // Calculate noise value
        const noise1 = noise(x * 2, y * 2, z * 2) * 0.2;
        const noise2 = noise(x * 4 + 100, y * 4 + 100, z * 4 + 100) * 0.1;
        
        // Apply noise
        const distortion = noise1 + noise2;
        const distance = Math.sqrt(x * x + y * y + z * z);
        const direction = new THREE.Vector3(x, y, z).normalize();
        
        // Apply distortion along the normal direction
        positions.setX(i, x + direction.x * distortion);
        positions.setY(i, y + direction.y * distortion);
        positions.setZ(i, z + direction.z * distortion);
    }
    
    baseGeometry.computeVertexNormals();
    return baseGeometry;
}

// Normalize a geometry to have the same number of vertices as the target
function normalizeGeometryVertices(geometry, targetVertexCount) {
    // If the geometry already has the right number of vertices, return it
    if (geometry.attributes.position.count === targetVertexCount) {
        return geometry;
    }
    
    // Otherwise, we need to resample the geometry
    // Create a temporary mesh with the geometry
    const material = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(geometry, material);
    
    // Create a new geometry with the target number of vertices
    const newGeometry = new THREE.BufferGeometry();
    const vertices = new Float32Array(targetVertexCount * 3);
    
    // Use MeshSurfaceSampler to distribute points evenly
    const sampler = new MeshSurfaceSampler(mesh).build();
    const tempPosition = new THREE.Vector3();
    
    for (let i = 0; i < targetVertexCount; i++) {
        sampler.sample(tempPosition);
        vertices[i * 3] = tempPosition.x;
        vertices[i * 3 + 1] = tempPosition.y;
        vertices[i * 3 + 2] = tempPosition.z;
    }
    
    // Set the position attribute
    newGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    newGeometry.computeVertexNormals();
    
    return newGeometry;
}

// Get the next shape to morph to
function getNextShape() {
    if (params.currentShape === 'random') {
        const shapes = Object.keys(morphTargets);
        const currentIndex = shapes.indexOf(params.currentMorphTarget);
        let nextIndex;
        
        do {
            nextIndex = Math.floor(Math.random() * shapes.length);
        } while (nextIndex === currentIndex);
        
        return shapes[nextIndex];
    }
    
    return params.currentShape;
}

// Create the liquid metal object
function createLiquidMetal() {
    // Start with a sphere
    const geometry = morphTargets.sphere.clone();
    
    // Create a highly reflective metal material
    const material = createMetalMaterial(params.metalColor);
    
    // Create the mesh
    liquidMetal = new THREE.Mesh(geometry, material);
    liquidMetal.castShadow = true;
    liquidMetal.receiveShadow = true;
    scene.add(liquidMetal);
    
    // Create a noise texture for the liquid effect
    const noiseTexture = createNoiseTexture();
    material.userData = {
        noiseTexture: noiseTexture
    };
}

// Create the metal material with proper reflective properties
function createMetalMaterial(type) {
    const metalProps = params.metalColors[type];
    
    const material = new THREE.MeshStandardMaterial({
        color: metalProps.color,
        emissive: metalProps.emissive,
        roughness: metalProps.roughness,
        metalness: metalProps.metalness,
        envMap: envMap,
        envMapIntensity: 1.0,
        flatShading: false
    });
    
    // For iridescent material, we'll use an onBeforeRender hook
    if (type === 'iridescent') {
        material.onBeforeRender = function(renderer, scene, camera, geometry, mesh) {
            const time = clock.getElapsedTime() * 0.5;
            const hue = (time % 1);
            
            // Update color based on camera angle and time
            const viewDir = new THREE.Vector3().subVectors(camera.position, mesh.position).normalize();
            const dot = 0.5 + 0.5 * Math.max(0, viewDir.dot(mesh.getWorldDirection(new THREE.Vector3())));
            
            // Use HSL for smooth color changes
            material.color.setHSL((hue + dot) % 1.0, 0.7, 0.5);
            material.emissive.setHSL((hue + dot + 0.5) % 1.0, 0.5, 0.2);
        };
    }
    
    return material;
}

// Create a noise texture for the liquid effect
function createNoiseTexture() {
    const size = 256;
    const data = new Uint8Array(size * size * 4);
    
    for (let i = 0; i < size * size * 4; i += 4) {
        const noise = Math.random() * 255;
        data[i] = noise;
        data[i+1] = noise;
        data[i+2] = noise;
        data[i+3] = 255;
    }
    
    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    texture.needsUpdate = true;
    
    return texture;
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
}

// Set up event listeners
function setupEventListeners() {
    // UI controls
    document.getElementById('autoMorph').addEventListener('change', function(e) {
        params.autoMorph = e.target.checked;
    });
    
    document.getElementById('morphSpeed').addEventListener('input', function(e) {
        params.morphSpeed = e.target.value / 100 * 2.0;
    });
    
    document.getElementById('turbulence').addEventListener('input', function(e) {
        params.surfaceTurbulence = e.target.value / 100;
    });
    
    document.getElementById('shapeSelect').addEventListener('change', function(e) {
        params.currentShape = e.target.value;
        
        if (params.currentShape !== 'random') {
            // Immediately start morphing to the selected shape
            params.currentMorphTime = 0;
            params.currentMorphTarget = params.nextMorphTarget;
            params.nextMorphTarget = params.currentShape;
        }
    });
    
    document.getElementById('colorSelect').addEventListener('change', function(e) {
        params.metalColor = e.target.value;
        
        // Update the material
        if (liquidMetal) {
            const newMaterial = createMetalMaterial(params.metalColor);
            newMaterial.userData = liquidMetal.material.userData;
            liquidMetal.material.dispose();
            liquidMetal.material = newMaterial;
        }
    });
}

// Update liquid metal morphing
function updateLiquidMetal(time) {
    if (!liquidMetal) return;
    
    // Get position attributes
    const positions = liquidMetal.geometry.attributes.position;
    const count = positions.count;
    
    // Update morphing progress
    if (params.autoMorph) {
        params.currentMorphTime += time * params.morphSpeed;
        
        // Check if it's time to switch to the next shape
        if (params.currentMorphTime >= params.morphDuration) {
            params.currentMorphTime = 0;
            params.currentMorphTarget = params.nextMorphTarget;
            params.nextMorphTarget = getNextShape();
        }
    }
    
    // Calculate morph factor (0 to 1)
    const morphFactor = params.currentMorphTime / params.morphDuration;
    
    // Get current and next shapes
    const currentShape = morphTargets[params.currentMorphTarget];
    const nextShape = morphTargets[params.nextMorphTarget];
    
    if (!currentShape || !nextShape) return;
    
    // Get position attributes of the shapes
    const currentPositions = currentShape.attributes.position;
    const nextPositions = nextShape.attributes.position;
    
    // Apply noise to each vertex
    for (let i = 0; i < count; i++) {
        // Get the base position from the current shape
        let x = currentPositions.getX(i);
        let y = currentPositions.getY(i);
        let z = currentPositions.getZ(i);
        
        // Get the target position from the next shape
        const targetX = nextPositions.getX(i);
        const targetY = nextPositions.getY(i);
        const targetZ = nextPositions.getZ(i);
        
        // Interpolate between current and next shape
        x = x + (targetX - x) * morphFactor;
        y = y + (targetY - y) * morphFactor;
        z = z + (targetZ - z) * morphFactor;
        
        // Apply noise for liquid effect
        const noiseTime = time * params.noiseSpeed;
        const noiseScale = params.noiseScale;
        
        // Use 3D simplex noise (approximated with sin/cos)
        const noise1 = Math.sin(x * noiseScale + noiseTime) * 
                       Math.cos(y * noiseScale + noiseTime) * 
                       Math.sin(z * noiseScale + noiseTime) * params.surfaceTurbulence;
                       
        const noise2 = Math.cos(x * noiseScale * 2 + noiseTime * 1.5) * 
                       Math.sin(y * noiseScale * 2 + noiseTime * 1.5) * 
                       Math.cos(z * noiseScale * 2 + noiseTime * 1.5) * params.surfaceTurbulence * 0.5;
        
        // Apply the noise to create a liquid-like effect
        const displacement = noise1 + noise2;
        
        // Calculate the direction from the center (normalize the position)
        const length = Math.sqrt(x * x + y * y + z * z);
        const nx = x / length;
        const ny = y / length;
        const nz = z / length;
        
        // Displace along the normal direction
        x += nx * displacement;
        y += ny * displacement;
        z += nz * displacement;
        
        // Update the position
        positions.setXYZ(i, x, y, z);
    }
    
    // Update the normals for proper lighting
    positions.needsUpdate = true;
    liquidMetal.geometry.computeVertexNormals();
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    
    const deltaTime = clock.getDelta();
    const elapsedTime = clock.getElapsedTime();
    
    // Update liquid metal
    updateLiquidMetal(deltaTime);
    
    // Animate lights
    updateLights(elapsedTime);
    
    // Update controls
    controls.update();
    
    // Render with post-processing
    composer.render();
}

// Update light positions for more dynamic reflections
function updateLights(time) {
    scene.children.forEach(child => {
        if (child instanceof THREE.PointLight) {
            // Make lights orbit around the model
            const speed = 0.5;
            const radius = 5;
            
            child.position.x = Math.sin(time * speed + child.position.z) * radius;
            child.position.z = Math.cos(time * speed + child.position.x) * radius;
        }
    });
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