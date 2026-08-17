let utopian_skins = {
    utopian : new Skin('images/utopian.png', new Vector2(1, 1))
}

let utopian_gen_img = new Image()
utopian_gen_img.src = 'images/generator.png'

let utopian_drone_img = new Image()
utopian_drone_img.src = 'images/drone.png'

class EnergyComponent {
    constructor(initial_energy, energy_gain, time_between_gain) {
        this.energy = initial_energy
        this.energy_gain = energy_gain
        this.time_between_gain = time_between_gain
        this.frame = 0
    }

    draw() {
        let draw_location = this.gameobject.components.controller.ability_draw_location.add(new Vector2(100, 0))
        drawText(this.energy + ' energy', 'white', '50px serif', draw_location.x, draw_location.y, 'left')
    }

    update() {
        if (this.frame >= this.time_between_gain) {
            this.energy += this.energy_gain
            this.frame = 0
        }
        this.frame++
    }
}

function get_lightning (player, angle, range, damage) {
    return new LightningComponent(player, 0, 50, {min : 50, max : 50}, {min : -50, max : 50}, angle, 'cyan', new Vector2(0, 0), range, damage)
}

class RotatingLightningComponent {
    constructor(player, lightning_rotation, range, damage, num_lightning) {
        this.player = player
        this.lightning_rotation = lightning_rotation
        this.num_lightning = num_lightning
        this.range = range
        this.damage = damage
    } 

    init() {
        let angle = rand_between(0, 360)
        for (let i = 0; i < this.num_lightning; i++) {
            this.gameobject.add_component('lightning_' + i, get_lightning(this.player, angle + i * (360 / this.num_lightning), this.range, this.damage))
        }
    }

    update() {
        for (let i = 0; i < this.num_lightning; i++) {
            this.gameobject.components['lightning_' + i].start_angle += this.lightning_rotation
        }
    }
}

class GeneratorComponent {
    constructor(player, energy_gain, time_between_gain) {
        this.player = player
        this.energy_gain = energy_gain
        this.time_between_gain = time_between_gain
        this.frame = 0
    }

    update() {
        if (this.frame >= this.time_between_gain) {
            this.player.components.energy.energy += this.energy_gain
            this.frame = 0
        }
        this.frame++
    }

    should_delete() {
        return !all_objects.includes(this.player)
    }
}

class DroneControllerComponent {
    constructor(player, drone_speed, friction) {
        this.drone_speed = drone_speed
        this.friction = friction
        this.player = player
        this.target = null
    }

    init() {
        this.target = find_target_with_tag(this.gameobject, this.player, 'player')
    }

    update() {
        this.gameobject.physical_properties.add_force(this.gameobject.physical_properties.velocity.scale(-this.friction))
        if (this.target === null) {
            this.target = find_target_with_tag(this.gameobject, this.player, 'player')
            return
        }
        let dir = this.target.position.add(this.gameobject.position.scale(-1)).normalize().scale(this.drone_speed)
        this.gameobject.physical_properties.add_force(dir)
    }

    should_delete() {
        return !all_objects.includes(this.player) || (!all_objects.includes(this.target) && this.target !== null)
    }
}

class TurretControllerComponent {
    constructor(player, turret_bullet_speed, reload_time, create_bullet) {
        this.player = player
        this.turret_bullet_speed = turret_bullet_speed
        this.reload_time = reload_time
        this.create_bullet = create_bullet
        this.dir = new Vector2(1, 0)
        this.frame = 0
    }

    draw() {
        let scale = this.gameobject.physical_properties.dimensions.x
        drawCircle(this.gameobject.position.x, this.gameobject.position.y, scale/2, 'grey', 'black', 2)
        let eye_posn = this.gameobject.position.add(this.dir.scale(scale / 2).scale(0.7))
        drawCircle(eye_posn.x, eye_posn.y, (scale / 2) * 0.2, 'red', 'red', 1)
    }

    update() {
        let target = find_target_with_tag(this.gameobject, this.player, 'player')
        if (target == null) {
            return
        }
        this.dir = target.position.add(this.gameobject.position.scale(-1)).normalize()
        if (this.frame >= this.reload_time) {
            this.frame = 0
            let bullet_spawn_posn = this.gameobject.position.add(this.dir.scale(120))
            let bullet_velocity = this.dir.scale(this.turret_bullet_speed)
            all_objects.push(this.create_bullet(bullet_spawn_posn, bullet_velocity))
        }
        this.frame++
    }

    should_delete() {
        return !all_objects.includes(this.player)
    }
}

function utopian_shock(player) {
    if (player.components.energy.energy < 35) { 
        return
    }
    player.components.energy.energy -= 35

    player.physical_properties.velocity = new Vector2(0, 0)
    player.components.controller.freeze(35)
    
    let angle = player.components.controller.flip ? 0 : 180
    let lightning = new GameObject(
        player.position.add(new Vector2(0, 0)),
        new PhysicalProperties(new Vector2(0, 0), Infinity, 0, new Vector2(0, 0), 0, true),
        ['lightning'],
        {
            lightning : new LightningComponent(player, 0, 50, {min : 50, max : 50}, {min : -90, max : 90}, angle, 'cyan', new Vector2(0, 10), 450, -0.65),
            del : new TimedDelete(30)
        }
    )
    all_objects.push(lightning)
}

function utopian_generator(player) {
    let generator = new GameObject(
        player.position.add(new Vector2(0, 0)),
        new PhysicalProperties(new Vector2(0, 0), Infinity, 0, new Vector2(75, 75), 0, false),
        ['generator', 'ground'],
        {
            lightning : new RotatingLightningComponent(player, 1, 450, -0.15, 2),
            health : new HealthComponent(60, true),
            generator : new GeneratorComponent(player, 6, 40, 1),
            draw : new ImageComponent(utopian_gen_img, new Vector2(0, 0), false)
        }
    )
    all_objects.push(generator)
}

const num_utopian_dones = 6
const drone_spawn_dist = 200
const initial_drone_velocity = 2
function utopian_drones(player) {
    if (player.components.energy.energy < 35) { 
        return
    }
    player.components.energy.energy -= 35

    let start_angle = rand_between(0, 360)

    for (let i = 0; i < num_utopian_dones; i++) {
        let angle = start_angle + i * (360 / num_utopian_dones)
        let dir = new Vector2(Math.cos(degrees_to_radians(angle)), Math.sin(degrees_to_radians(angle)))
        let drone_pos = dir.scale(drone_spawn_dist).add(player.position)

        let drone_vel = dir.scale(initial_drone_velocity)

        let attack = new Attack(
            player,
            undefined,
            [
                new Effect(
                    [   
                        damage(-5),
                        delete_self(),
                        knockback_velocity(20),
                    ],
                    filter_by_can_damage()
                )
            ]
        )    

        let drone = new GameObject(
            drone_pos,
            new PhysicalProperties(drone_vel, 30, 0, new Vector2(25, 25), 0, false),
            ['drone'],
            {
                drone_controller : new DroneControllerComponent(player, 10, 1),
                attack : attack,
                health : new HealthComponent(20, true),
                draw : new ImageComponent(utopian_drone_img, new Vector2(0, 0), false)
            }
        )
        all_objects.push(drone)
    }
}

function utopian_turret(player) {
    if (player.components.energy.energy < 100) { 
        return
    }
    player.components.energy.energy -= 100

    let create_bullet = (posn, vel) => {
        return new GameObject(
            posn,
            new PhysicalProperties(vel, 100, 0, new Vector2(20, 20), 1, false),
            ['laser', 'projectile'],
            {
                attack : new Attack(player, undefined, [new Effect([damage(-12), delete_self()],filter_by_can_damage())]),
                draw : new CircleComponent(new Vector2(0, 0), 'red', 'red', 1, 1)
            }
        )
    }

    let turret = new GameObject(
        player.position.add(new Vector2(0, 0)),
        new PhysicalProperties(new Vector2(0, 0), Infinity, 0, new Vector2(100, 100), 0, false),
        ['turret', 'ground'],
        {
            turret_controller : new TurretControllerComponent(player, 13.5, 150, create_bullet),
            health : new HealthComponent(40, true)
        }
    )
    all_objects.push(turret)
}

function utopian_teleport(player) {
    let dir = player.components.controller.controller.controller.axes()

    let create_rotating_lightning = () => new GameObject(
        player.position.add(new Vector2(0, 0)),
        new PhysicalProperties(new Vector2(0, 0), Infinity, 0, new Vector2(0, 0), 0, true),
        ['lightning'],
        {
            lightning : new RotatingLightningComponent(4, 450, -0.15, 4),
            del : new TimedDelete(90)
        }
    )
    all_objects.push(create_rotating_lightning())
    player.position = dir.scale(500).add(player.position)
    all_objects.push(create_rotating_lightning())
}

function create_utopian(gamepad, position, ability_draw_location, skin_name) {
    let abilities = [
        new Ability(utopian_shock, 'shock', 20),
        new Ability(utopian_generator, 'generator', 355),
        new Ability(utopian_drones, 'spawn drones', 20),
        new Ability(utopian_turret, 'turret', 20),
        new Ability(utopian_teleport, 'teleport', 600, true, 2, 20)
    ]

    return new GameObject(
        position,
        new PhysicalProperties(new Vector2(0, 0), 128, 0.25, new Vector2(128, 128), 0, false),
        ['utopian', 'player', 'grabbable'],
        {
            controller : new PlayerControllerComponent(
                utopian_skins[skin_name],
                ability_draw_location, 
                gamepad, 
                abilities, 
                new PlayerControllerProperties(-8.5, 20, 5.5, 3), 
                true
            ), 
            stats : new PlayerStatsComponent(256),
            energy : new EnergyComponent(50, 3, 60)
        }
    )
}