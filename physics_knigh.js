const lightning_noise = new Audio('sounds/honour_shall_prevail.mp3')
const magic_noise = new Audio('sounds/magic_sir.mp3')
const sword_slash_noises = [new Audio('sounds/sirr.mp3'), new Audio('sounds/so_honourable.mp3')]
const bigly_knight_noises = [new Audio('sounds/sir_i_voted_for_trump.mp3'), new Audio('sounds/i_voted_for_trump_sir.mp3')]
const physics_noise = new Audio('sounds/ready_to_study_physics.mp3')

let knigh_skins = {
    knigh : new Skin('images/knight.png', new Vector2(1, 1))
}

let honour_sword = new Image()
honour_sword.src = 'images/honoursword.png'

let fireball = new Image()
fireball.src = 'images/fireball.png'

let snowball = new Image()
snowball.src = 'images/snowflake.png'

let lightning_cloud = new Image()
lightning_cloud.src = 'images/lightning_cloud.png'

class KnighProjectileComponent {
    constructor(max_num_projectiles, current_selection) {
        this.max_num_projectiles = max_num_projectiles
        this.current_num_projectiles = 0
        this.current_selection = current_selection
    }
}

const we_have_this_chance = 0.05

function honour_slash(player) {
    let bigly = Math.random() <= we_have_this_chance
    if (bigly) {
        bigly_knight_noises[Math.floor(Math.random() * bigly_knight_noises.length)].play()
    } else {
        sword_slash_noises[Math.floor(Math.random() * sword_slash_noises.length)].play()
    }
    let attack = new Attack(
        player,
        (attack) => {
            attack.player.physical_properties.velocity = new Vector2(0, 0)
            let angle = attack.frame * 3 - 120
            let x = Math.cos(degrees_to_radians(angle))
            let y = Math.sin(degrees_to_radians(angle))
            attack.gameobject.components.draw.flipped = !player.components.controller.flip 
            let posn = new Vector2(
                (player.components.controller.flip ? 1 : -1) * player.physical_properties.dimensions.x * x,
                player.physical_properties.dimensions.y * y
            )
            if (player.components.controller.flip) {
                attack.gameobject.components.draw.angle = -45 - angle
            } else {
                attack.gameobject.components.draw.angle = angle + 45
            }
            attack.gameobject.position = posn.scale(1.75).add(player.position)
        }, 
        [
            new Effect(
                [damage(-20 * (bigly ? 2 : 1)), knockback_angled(20, 7.5)],
                and_filters([filter_by_can_damage(), filter_by_hit])
            ),
            new Effect(
                [(attack, obj) => obj.physical_properties.velocity.x = (attack.player.components.controller.flip ? 1 : -1) * 10],
                filter_by_tag('projectile')
            )
        ]
    )
    let image = new ImageComponent(
        honour_sword,
        new Vector2(0, 0),
        !player.components.controller.flip
    )
    let sword = attatched_hitbox(attack, image, 50, 1.5)
    sword.add_component('reflect', new Reflect(player))
    all_objects.push(sword)

    let dir = (player.components.controller.flip ? 1 : -1)
    let posn = new Vector2(player.physical_properties.dimensions.x, 0).scale(dir).add(player.position)

    if(player.components.knigh_projectile_component.current_num_projectiles > 0) {
        player.components.knigh_projectile_component.current_num_projectiles--
        let projectile_type = player.components.knigh_projectile_component.current_selection
        all_objects.push(projectile_type(player, posn, new Vector2(1, 0).scale(dir), 5000))
    }
}

function ice_projectile(player, position, velocity, time_alive) {
    let attack = new Attack(
        player,
        undefined,
        [
            new Effect(
                [
                    damage(-10),
                    delete_self(),
                    (_, player) => {
                        player.physical_properties.velocity = new Vector2(0, 0)
                        player.components.controller.stun(90)
                    }
                ],
                filter_by_can_damage()
            )
        ]
    )

    let snowflake = new ImageComponent(snowball, new Vector2(0, 0), false)

    let physics = new PhysicalProperties(
        velocity, 
        100,
        0,
        new Vector2(75, 75),
        0,
        true
    )

    return projectile(position, attack, snowflake, physics, time_alive)
}

function fire_projectile(player, position, velocity, time_alive) {
    let attack = new Attack(
        player,
        undefined,
        [
            new Effect(
                [damage(-1.5)],
                filter_by_can_damage()
            )
        ]
    )

    let fire = new ImageComponent(fireball, new Vector2(0, 0), player.components.controller.flip)

    let physics = new PhysicalProperties(
        velocity, 
        100,
        0,
        new Vector2(150, 75),
        0,
        true
    )

    return projectile(position, attack, fire, physics, time_alive)
}

function physics_homework(player) {
    physics_noise.play()
    for (let i = 0; i < 100; i++) {
        let position = new Vector2(Math.floor(Math.random() * arena_width), -Math.floor(Math.random() * 500))
        let velocity = new Vector2(0, -Math.floor(Math.random() * 50));
        all_objects.push(spawn_math(Math.round(Math.random() *  100), position, velocity))
    }
    let prev = player.components.stats.input_damage_scale
    player.components.stats.input_damage_scale = 0
    setTimeout(function () {
        player.components.stats.input_damage_scale = prev
    }, 7500)
}


function spawn_math(number, position, velocity) {
    let text = new TextComponent(
        number + '',
        'white',
        Math.round(Math.random() * 30 + 20) + 'px serif'
    )

    let physics = new PhysicalProperties(
        velocity, 
        30,
        0.25,
        new Vector2(40, 40),
        0,
        true
    )

    return new GameObject(
        position,
        physics,
        ['math'],
        {
            draw : text
        }
    )
}

function knigh_ice(player) {
    magic_noise.play()
    player.components.knigh_projectile_component.current_selection = ice_projectile
    player.components.knigh_projectile_component.current_num_projectiles = player.components.knigh_projectile_component.max_num_projectiles
}

function knigh_fire(player) {
    magic_noise.play()
    player.components.knigh_projectile_component.current_selection = fire_projectile
    player.components.knigh_projectile_component.current_num_projectiles = player.components.knigh_projectile_component.max_num_projectiles
}

function knigh_lightning(player) {
    lightning_noise.play()
    player.components.stats.apply_damage(-20)
    let lightning = new GameObject(
        new Vector2(player.position.x, 200),
        new PhysicalProperties(new Vector2(0, 0), Infinity, 0, new Vector2(350, 350), 0, true),
        ['lightning'],
        {
            lightning : new LightningComponent(player, 30, 30, {min : 10, max : 50}, {min : -70, max : 70}, 90, 'yellow', new Vector2(200, 0), Infinity, -2),
            draw : new AnimatedImageComponent(lightning_cloud, 64, 7, 4, new Vector2(0, 0), false, true),
            del : new TimedDelete(1000)
        }
    )
    all_objects.push(lightning)
}

function create_knigh(gamepad, position, ability_draw_location, skin_name) {
    let abilities = [
        new Ability(honour_slash, "honour slash", 110),
        new Ability(knigh_fire, "fire magic", 400),
        new Ability(knigh_ice, "ice magic", 400),
        new Ability(knigh_lightning, "lightning magic", 1500, true),
        new Ability(physics_homework, "physics homework", 1750, true)
    ]

    return new GameObject(
        position,
        new PhysicalProperties(new Vector2(0, 0), 150, 0.25, new Vector2(90, 90), 0, false),
        ['knigh', 'player', 'grabbable'],
        {
            controller : new PlayerControllerComponent(
                knigh_skins[skin_name],
                ability_draw_location, 
                gamepad, 
                abilities, 
                new PlayerControllerProperties(-26, 25, 8, 2), 
                false
            ), 
            stats : new PlayerStatsComponent(250),
            knigh_projectile_component : new KnighProjectileComponent(3, null)
        }
    )
}