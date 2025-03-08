import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// Global variables
let scene, camera, renderer, composer, controls;
let crystal, lightSources = [];
let clock = new THREE.Clock();
let envMap;

// Crystal parameters
const crystalParams = {
    // Main crystal properties
    facets: 8,
    height: 4,
    radius: 1.2,
    segments: 32,
    roughness: 0.1,
    metalness: 0.3,
    transmission: 0.95,
    ior: 2.4,
    thickness: 0.5,
    
    // Crystal rotation
    autoRotate: true,
    rotationSpeed: 0.15,
    
    // Dynamic color
    enableRainbow: true,
    rainbowSpeed: 0.3,
    
    // Crystal shape modifications
    distortion: 0.15,
    
    // Light properties
    lightIntensity: 1.5,
    lightColor: 0xffffff,
    
    // Visual effects
    bloom: true,
    bloomStrength: 0.8,
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
    camera.position.set(0, 0, 8);
    
    // Set up renderer with physically correct lighting
    renderer = new THREE.WebGLRenderer({ 
        antialias: true,
        powerPreference: "high-performance"
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.physicallyCorrectLights = true;
    document.body.appendChild(renderer.domElement);
    
    // Add orbit controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 3;
    controls.maxDistance = 20;
    
    // Load HDR environment map for realistic reflections
    loadEnvironmentMap();
    
    // Add lights
    setupLights();
    
    // Create crystal when environment map is loaded
    createCrystal();
    
    // Set up post-processing
    setupPostProcessing();
    
    // Handle window resize
    window.addEventListener('resize', onWindowResize);
    
    // Start animation
    animate();
}

// Load HDR environment map for reflections
function loadEnvironmentMap() {
    const rgbeLoader = new RGBELoader();
    rgbeLoader.setDataType(THREE.HalfFloatType);
    
    // Use a placeholder environment map until loaded
    // Create a simple cubemap for initial rendering
    const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(256);
    cubeRenderTarget.texture.type = THREE.HalfFloatType;
    
    // Create a simple ambient scene for reflection
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();
    
    // Create a default environment map with colorful gradient
    const envScene = new THREE.Scene();
    
    // Create a large sphere with gradient material
    const gradientMaterial = new THREE.ShaderMaterial({
        uniforms: {
            topColor: { value: new THREE.Color(0x0077ff) },
            bottomColor: { value: new THREE.Color(0xff8800) }
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
                float h = normalize(vWorldPosition).y;
                vec3 gradientColor = mix(bottomColor, topColor, h * 0.5 + 0.5);
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
    
    // Set background to the environment map (optional)
    // scene.background = envMap;
    
    // Clean up
    pmremGenerator.dispose();
}

// Set up scene lights
function setupLights() {
    // Ambient light for general illumination
    const ambientLight = new THREE.AmbientLight(0x333333, 0.5);
    scene.add(ambientLight);
    
    // Create multiple light sources for interesting reflections
    const lightPositions = [
        { color: 0xff5555, position: new THREE.Vector3(5, 3, 2), intensity: 2 },
        { color: 0x55ff55, position: new THREE.Vector3(-5, 2, 3), intensity: 2 },
        { color: 0x5555ff, position: new THREE.Vector3(0, 5, -3), intensity: 2 },
        { color: 0xffff55, position: new THREE.Vector3(0, -3, -5), intensity: 1.5 }
    ];
    
    lightPositions.forEach(lightData => {
        // Create point light
        const light = new THREE.PointLight(
            lightData.color, 
            lightData.intensity * crystalParams.lightIntensity,
            20,  // distance
            2    // decay
        );
        light.position.copy(lightData.position);
        light.castShadow = true;
        
        // Improve shadow quality
        light.shadow.mapSize.width = 512;
        light.shadow.mapSize.height = 512;
        light.shadow.bias = -0.001;
        light.shadow.radius = 4;
        
        // Add to scene and store reference
        scene.add(light);
        lightSources.push(light);
        
        // Create small visible sphere to represent light source
        const lightSphere = new THREE.Mesh(
            new THREE.SphereGeometry(0.1, 8, 8),
            new THREE.MeshBasicMaterial({ color: lightData.color })
        );
        lightSphere.position.copy(lightData.position);
        scene.add(lightSphere);
    });
}

// Create the crystal geometry and material
function createCrystal() {
    // Create a complex crystal shape by combining geometries
    const crystalGroup = new THREE.Group();
    
    // Create main crystal body using a modified cone geometry
    const mainGeometry = createCrystalGeometry();
    
    // Create glass-like material with refraction and dispersion
    const crystalMaterial = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        metalness: crystalParams.metalness,
        roughness: crystalParams.roughness,
        transmission: crystalParams.transmission, // Transparency
        transparent: true,
        ior: crystalParams.ior, // Index of refraction
        thickness: crystalParams.thickness, // Thickness for refraction
        envMap: envMap,
        envMapIntensity: 1.5,
        clearcoat: 1.0,
        clearcoatRoughness: 0.1
    });
    
    // Create the main crystal mesh
    const mainCrystal = new THREE.Mesh(mainGeometry, crystalMaterial);
    mainCrystal.castShadow = true;
    mainCrystal.receiveShadow = true;
    crystalGroup.add(mainCrystal);
    
    // Add small crystal fragments around the main crystal for more visual interest
    addCrystalFragments(crystalGroup, crystalMaterial);
    
    // Add group to scene and store reference
    scene.add(crystalGroup);
    crystal = crystalGroup;
}

// Create the main crystal geometry
function createCrystalGeometry() {
    // Create a crystal shape using modified cylinder geometry
    const height = crystalParams.height;
    const radius = crystalParams.radius;
    const segments = crystalParams.segments;
    const facets = crystalParams.facets;
    
    // Create a cylinder as a base
    const geometry = new THREE.CylinderGeometry(
        radius * 0.2, // top radius
        radius,      // bottom radius
        height,
        facets,      // radial segments
        segments,    // height segments
        false
    );
    
    // Create top pyramid
    const topPyramid = new THREE.ConeGeometry(
        radius * 0.2, // radius
        height * 0.5, // height
        facets,       // radial segments
        1,            // height segments
        false
    );
    topPyramid.translate(0, height * 0.75, 0);
    
    // Merge geometries
    geometry.vertices = [...geometry.vertices, ...topPyramid.vertices];
    geometry.faces = [...geometry.faces, ...topPyramid.faces];
    
    // Add distortion to vertices for more natural crystal look
    const positionAttribute = geometry.getAttribute('position');
    for (let i = 0; i < positionAttribute.count; i++) {
        const x = positionAttribute.getX(i);
        const y = positionAttribute.getY(i);
        const z = positionAttribute.getZ(i);
        
        // Apply noise-based distortion
        const distortionScale = crystalParams.distortion;
        const distortFactor = Math.sin(x * 5) * Math.cos(z * 4) * distortionScale;
        const heightFactor = (y / height + 0.5); // More distortion at edges
        
        positionAttribute.setX(i, x + Math.sin(z * 2 + x) * distortionScale * heightFactor);
        positionAttribute.setZ(i, z + Math.cos(x * 3 + y) * distortionScale * heightFactor);
    }
    
    geometry.computeVertexNormals();
    return geometry;
}

// Add small crystal fragments around the main crystal
function addCrystalFragments(targetGroup, material) {
    const fragmentCount = 6;
    
    for (let i = 0; i < fragmentCount; i++) {
        // Create small crystal shards
        const size = Math.random() * 0.5 + 0.3;
        const fragGeometry = new THREE.ConeGeometry(
            size * 0.2,   // radius
            size,         // height
            Math.floor(Math.random() * 3) + 3, // random number of sides
            1,
            false
        );
        
        // Randomize geometry
        const positions = fragGeometry.attributes.position;
        for (let j = 0; j < positions.count; j++) {
            const x = positions.getX(j);
            const y = positions.getY(j);
            const z = positions.getZ(j);
            
            // Apply random distortion
            positions.setX(j, x + (Math.random() - 0.5) * 0.1);
            positions.setZ(j, z + (Math.random() - 0.5) * 0.1);
        }
        
        // Place fragments around the main crystal
        const fragment = new THREE.Mesh(fragGeometry, material);
        
        // Random position around the main crystal
        const theta = Math.random() * Math.PI * 2;
        const radius = crystalParams.radius * 1.2;
        const y = (Math.random() - 0.5) * crystalParams.height;
        
        fragment.position.set(
            Math.cos(theta) * radius,
            y,
            Math.sin(theta) * radius
        );
        
        // Random rotation
        fragment.rotation.set(
            Math.random() * Math.PI,
            Math.random() * Math.PI,
            Math.random() * Math.PI
        );
        
        fragment.castShadow = true;
        fragment.receiveShadow = true;
        targetGroup.add(fragment);
    }
}

// Set up post-processing effects
function setupPostProcessing() {
    // Create composer
    composer = new EffectComposer(renderer);
    
    // Add render pass
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);
    
    // Add bloom pass for glow effect
    if (crystalParams.bloom) {
        const bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            crystalParams.bloomStrength,
            crystalParams.bloomRadius,
            crystalParams.bloomThreshold
        );
        composer.addPass(bloomPass);
    }
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    
    const time = clock.getElapsedTime();
    
    // Update crystal rotation
    if (crystal && crystalParams.autoRotate) {
        crystal.rotation.y = time * crystalParams.rotationSpeed;
        crystal.rotation.z = time * crystalParams.rotationSpeed * 0.3;
    }
    
    // Update rainbow effect if enabled
    if (crystal && crystalParams.enableRainbow) {
        const mainCrystal = crystal.children[0];
        if (mainCrystal && mainCrystal.material) {
            // Create a shifting RGB hue based on time
            const hue = (time * crystalParams.rainbowSpeed) % 1;
            const dispersionOffset = Math.sin(time * 0.5) * 0.1;
            
            // Use HSL color to create rainbow effect
            const color = new THREE.Color();
            color.setHSL(hue, 0.5, 0.7);
            
            // Apply to material
            mainCrystal.material.color = color;
            
            // Change material properties slightly for animation
            mainCrystal.material.ior = crystalParams.ior + Math.sin(time) * 0.1;
            mainCrystal.material.transmission = 
                crystalParams.transmission + Math.sin(time * 0.3) * 0.05;
        }
    }
    
    // Animate light sources
    lightSources.forEach((light, i) => {
        const initialPos = light.position.clone();
        const radius = 0.5;
        const speed = 0.5 + i * 0.2;
        const phase = i * Math.PI / 2;
        
        // Move lights in circular patterns at different speeds
        light.position.x = initialPos.x + Math.sin(time * speed + phase) * radius;
        light.position.y = initialPos.y + Math.cos(time * speed + phase) * radius;
    });
    
    // Update controls
    controls.update();
    
    // Render with post-processing
    composer.render();
}

// Window resize handler
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
}

// Polyfill for missing cylinder geometry methods in newer Three.js versions
if (!THREE.CylinderGeometry.prototype.vertices) {
    THREE.CylinderGeometry.prototype.vertices = [];
}

if (!THREE.CylinderGeometry.prototype.faces) {
    THREE.CylinderGeometry.prototype.faces = [];
}

if (!THREE.ConeGeometry.prototype.vertices) {
    THREE.ConeGeometry.prototype.vertices = [];
}

if (!THREE.ConeGeometry.prototype.faces) {
    THREE.ConeGeometry.prototype.faces = [];
}

// Start the application
init(); 