import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// Global variables
let scene, camera, renderer, composer, controls;
let blob, particles = [];
let noise = [];
let clock = new THREE.Clock();

// Initialize the scene
function init() {
    // Create the scene
    scene = new THREE.Scene();
    
    // Set up camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 5;
    
    // Set up renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.body.appendChild(renderer.domElement);
    
    // Add orbit controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    
    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0x222222);
    scene.add(ambientLight);
    
    // Add directional lights for better visualization
    const light1 = new THREE.DirectionalLight(0xff00ff, 1);
    light1.position.set(1, 1, 1);
    scene.add(light1);
    
    const light2 = new THREE.DirectionalLight(0x00ffff, 1);
    light2.position.set(-1, -1, -1);
    scene.add(light2);
    
    // Create the blob
    createBlob();
    
    // Create the particles
    createParticles();
    
    // Set up post-processing
    setupPostProcessing();
    
    // Handle window resize
    window.addEventListener('resize', onWindowResize);
    
    // Initialize noise values
    initNoiseValues();
    
    // Start animation
    animate();
}

// Create morphing blob with neon gradient
function createBlob() {
    // Create the geometry (icosahedron for better morphing)
    const geometry = new THREE.IcosahedronGeometry(1, 4);
    
    // Create shader material for neon gradient
    const material = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 }
        },
        vertexShader: `
            uniform float time;
            varying vec3 vNormal;
            varying vec3 vPosition;
            
            // Simplex noise functions from https://github.com/ashima/webgl-noise
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
            
            void main() {
                vNormal = normal;
                
                // Add time-based noise to each vertex
                float noiseScale = 2.0;
                float timeFactor = time * 0.3;
                
                // Generate multiple layers of noise for more complex movement
                float noise1 = snoise(position * noiseScale + vec3(timeFactor * 0.7, timeFactor * 0.8, timeFactor * 0.9)) * 0.2;
                float noise2 = snoise(position * noiseScale * 2.0 + vec3(timeFactor * 1.1, timeFactor * 1.2, timeFactor * 1.3)) * 0.1;
                float noise3 = snoise(position * noiseScale * 4.0 + vec3(timeFactor * 1.5, timeFactor * 1.6, timeFactor * 1.7)) * 0.05;
                
                // Combine noise layers
                float combinedNoise = noise1 + noise2 + noise3;
                
                // Move vertices along their normals
                vec3 newPosition = position + normal * combinedNoise;
                
                vPosition = newPosition;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
            }
        `,
        fragmentShader: `
            varying vec3 vNormal;
            varying vec3 vPosition;
            uniform float time;
            
            void main() {
                // Create a pulsing time factor
                float pulsingFactor = sin(time * 0.5) * 0.5 + 0.5;
                
                // Normalize position for color mapping
                vec3 normalized = normalize(vPosition);
                
                // Create a gradient based on position and time
                vec3 color1 = vec3(0.8, 0.1, 0.9); // Purple
                vec3 color2 = vec3(0.1, 0.8, 0.9); // Cyan
                vec3 color3 = vec3(0.9, 0.3, 0.7); // Pink
                
                // Mix colors based on position and time
                float t1 = sin(time * 0.3 + vPosition.x * 2.0) * 0.5 + 0.5;
                float t2 = cos(time * 0.4 + vPosition.y * 2.0) * 0.5 + 0.5;
                
                vec3 mixedColor = mix(mix(color1, color2, t1), color3, t2);
                
                // Add specular highlights
                vec3 normal = normalize(vNormal);
                vec3 lightDir = normalize(vec3(sin(time), cos(time), 1.0));
                float specular = pow(max(dot(reflect(-lightDir, normal), vec3(0.0, 0.0, 1.0)), 0.0), 32.0);
                
                // Add rim lighting
                float rim = 1.0 - max(dot(normal, vec3(0.0, 0.0, 1.0)), 0.0);
                rim = pow(rim, 3.0) * pulsingFactor;
                
                // Combine all lighting effects
                vec3 finalColor = mixedColor + specular * 0.5 + rim * vec3(0.3, 0.7, 1.0);
                
                gl_FragColor = vec4(finalColor, 1.0);
            }
        `,
        transparent: true
    });
    
    // Create the blob mesh
    blob = new THREE.Mesh(geometry, material);
    scene.add(blob);
}

// Create orbiting particles
function createParticles() {
    const particleCount = 200;
    const particleGeometry = new THREE.SphereGeometry(0.02, 8, 8);
    
    for (let i = 0; i < particleCount; i++) {
        // Create random orbit parameters
        const radius = 2 + Math.random() * 2;
        const speed = 0.2 + Math.random() * 0.5;
        const offset = Math.random() * Math.PI * 2;
        const orbitAngle = Math.random() * Math.PI * 2;
        const orbitAxis = new THREE.Vector3(
            Math.sin(orbitAngle),
            Math.cos(orbitAngle),
            Math.random() - 0.5
        ).normalize();
        
        // Create a glowing particle material
        const color = new THREE.Color();
        color.setHSL(Math.random(), 0.8, 0.8);
        
        const particleMaterial = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.8
        });
        
        // Create the particle
        const particle = new THREE.Mesh(particleGeometry, particleMaterial);
        
        // Store particle properties
        particle.userData = {
            radius,
            speed,
            offset,
            orbitAxis
        };
        
        // Add particle to scene and array
        scene.add(particle);
        particles.push(particle);
    }
}

// Initialize noise values for more consistent morphing
function initNoiseValues() {
    const vertexCount = blob.geometry.getAttribute('position').count;
    for (let i = 0; i < vertexCount; i++) {
        noise.push(Math.random() * 2 - 1);
    }
}

// Set up post-processing for glow effects
function setupPostProcessing() {
    // Create composer
    composer = new EffectComposer(renderer);
    
    // Add render pass
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);
    
    // Add bloom pass for glow effect
    const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        1.0,   // strength
        0.2,   // radius
        0.7    // threshold
    );
    composer.addPass(bloomPass);
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    
    const time = clock.getElapsedTime();
    
    // Update blob shader time uniform
    if (blob && blob.material.uniforms) {
        blob.material.uniforms.time.value = time;
    }
    
    // Update blob rotation
    if (blob) {
        blob.rotation.y = time * 0.1;
        blob.rotation.z = time * 0.05;
    }
    
    // Update particle positions
    particles.forEach(particle => {
        const { radius, speed, offset, orbitAxis } = particle.userData;
        
        // Calculate position on orbit
        const angle = time * speed + offset;
        
        // Create rotation matrix around orbit axis
        const rotationMatrix = new THREE.Matrix4();
        rotationMatrix.makeRotationAxis(orbitAxis, angle);
        
        // Calculate initial position on orbit path
        const basePosition = new THREE.Vector3(radius, 0, 0);
        
        // Apply rotation to get current position
        basePosition.applyMatrix4(rotationMatrix);
        
        // Add small wobble
        const wobble = Math.sin(time * 5 + offset) * 0.05;
        basePosition.addScaledVector(orbitAxis, wobble);
        
        // Update particle position
        particle.position.copy(basePosition);
        
        // Pulsate particle size
        const scale = 0.8 + Math.sin(time * 3 + offset * 10) * 0.2;
        particle.scale.set(scale, scale, scale);
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

// Start the application
init(); 