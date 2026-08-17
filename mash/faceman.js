const rushdown_noise = new Audio('sounds/boglybooglyjiglyjoogly.mp3')
const eat_noise = new Audio('sounds/nomnomnom.mp3')
const puke_noise = new Audio('sounds/puke.mp3')

let faceman_skins = {
    faceman : new Skin('images/faceman.png', new Vector2(1, 1)),
    faceman_shaman : new Skin('images/faceman_shaman.png', new Vector2(1.5, 1.5), new Vector2(0, -0.17))
}

let teeth_img = new Image()
teeth_img.src = 'images/teeth.png'

const mass_cap = 250

function faceman_bite(player) {
    eat_noise.play()
    let attack = new Attack(
        player,
        offset_changes_with_player(true, new Vector2(0.6, 0.2), 1.5),
        [
            new Effect(
                [
                    damage(-0.5),
                    knockback_angled(1, 10),
                ],
                filter_by_can_damage(),
            ),
            new Effect(
                [
                    delete_other(),
                    (attack, obj) => {
                        let mass = obj.physical_properties.mass
                        attack.player.physical_properties.mass += mass
                        attack.player.physical_properties.dimensions.x += mass
                        attack.player.physical_properties.dimensions.y += mass
                    }
                ],
                filter_by_tag('belch')
            ),
            new Effect(
                [
                    delete_other(), 
                    (attack, _) => {
                        attack.player.components.stats.apply_damage(0.05)
                    }
                ],
                filter_by_tag('projectile')
            ),
            new Effect(
                [
                    (attack, _) => {
                        attack.player.components.stats.apply_damage(0.1)
                        if (attack.player.physical_properties.mass < mass_cap) {
                            attack.player.physical_properties.dimensions.x += 1
                            attack.player.physical_properties.dimensions.y += 1
                            attack.player.physical_properties.mass += 1
                        }
                    }
                ],
                filter_by_tag('player')
            )
        ]
    )

    let image = new AnimatedImageComponent(
        teeth_img,
        64,
        7,
        2,
        new Vector2(0, 0),
        !player.components.controller.flip
    )

    let bite = attatched_hitbox(attack, image, 250, 1.5)
    all_objects.push(bite)
}

function faceman_rush(player) {
    rushdown_noise.play()
    console.log(player.components.controller)
    let dir = player.components.controller.controller.controller.axes()
    player.physical_properties.velocity = dir.scale(35)
    
    let attack = new Attack(
        player,
        constant_offset(player, new Vector2(0, 0)),
        [
            new Effect(
                [damage(-30),knockback_angled(25, 30)],         
                and_filters([filter_by_can_damage(), filter_by_hit])
            )
        ]
    )
    all_objects.push(attatched_hitbox(attack, {}, 60, 2))
}

function faceman_belch(player) {
    if (player.physical_properties.mass < 100) {
        return 
    }
    puke_noise.play()
    let dir = (player.components.controller.flip ? 1 : -1)
    let position = player.position.add(new Vector2(player.physical_properties.dimensions.x * dir, 0))
    let velocity = new Vector2(dir * 3, -3)
    let belch = belch_projectile(player, position, velocity, player.physical_properties.mass / 2, 9999999999, 0)
    player.physical_properties.mass /= 2
    player.physical_properties.dimensions = player.physical_properties.dimensions.scale(0.5)
    all_objects.push(belch)
}

function belch_projectile(player, position, velocity, mass, time_alive, elasticity) {
    let attack = new Attack(
        player,
        undefined,
        [
            new Effect(
                [damage(mass * -1.35), delete_self()],
                filter_by_can_damage()
            )
        ]
    )

    let rect = new RectComponent(
        new Vector2(0, 0),
        'green'
    )
        
    let physics = new PhysicalProperties(
        velocity, 
        mass,
        0.25,
        new Vector2(mass, mass),
        elasticity,
        false
    )

    let belch = projectile(position, attack, rect, physics, time_alive)
    belch.add_component('stop_on_collision', new StopOnCollision())
    belch.tags.push('belch')
    return belch
}

function create_faceman(gamepad, position, ability_draw_location, skin_name) {
    let abilities = [
        new Ability(faceman_bite, 'eat', 500),
        new Ability(faceman_rush, 'rushdown', 300, true, 2, 20),
        new Ability(faceman_belch, 'belch', 20)
    ]

    return new GameObject(
        position,
        new PhysicalProperties(new Vector2(0, 0), 100, 0.3, new Vector2(100, 100), 0, false),
        ['faceman', 'player', 'grabbable'],
        {
            controller : new PlayerControllerComponent(
                faceman_skins[skin_name],
                ability_draw_location, 
                gamepad, 
                abilities, 
                new PlayerControllerProperties(-10.5, 30, 5, 3), 
                true
            ), 
            stats : new PlayerStatsComponent(180)
        }
    )
}