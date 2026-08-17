const yesyesyes_i_win = new Audio('sounds/the_biglywinlose.mp3')
const orange_throw = new Audio('sounds/orange_throw.mp3')
const orange_splat = new Audio('sounds/orange_splat.mp3')
const bigly = new Audio('sounds/bigly.mp3')

let trump_skins = {
    trump : new Skin('images/trump.png', new Vector2(1, 1))
}

let bigly_fist_img = new Image()
bigly_fist_img.src = "images/biglyfist.png"

class ApprovalComponent {
    constructor(approval_start, approval_change_rate, base_dmg) {
        this.approval = approval_start
        this.approval_change_rate = approval_change_rate
        this.base_dmg = base_dmg
    }

    draw() {
        let draw_location = this.gameobject.components.controller.ability_draw_location.add(new Vector2(100, 0))
        drawText((this.approval * 100).toFixed(1) + '% approval', 'white', '50px serif', draw_location.x, draw_location.y, 'left')
    }

    update() {
        this.gameobject.components.stats.output_damage_scale = this.approval + this.base_dmg
        if (this.approval > 0) {
            this.approval += this.approval_change_rate * (this.approval * this.approval)
        }  else if (this.approval < 0) {
            this.approval = 0
        }
    }
}
function change_approval(amount) {
    return (attack, _) => attack.player.components.approval.approval += amount
}

class State {
    constructor(image_src, scale, ability) {
        this.image = new Image()
        this.image.src = image_src
        this.scale = scale
        this.ability = ability
    }
}

let states = [
    new State(
        'images/states/california.png',
        new Vector2(516, 595).scale(0.25),
        player => {
            player.components.approval.approval += 1
            let temp = player.components.approval.approval_change_rate
            player.components.approval.approval_change_rate = 0
            setTimeout(function () {
                player.components.approval.approval -= 1
                player.components.approval.approval_change_rate = temp
            }, 8000)
        }
    ),
    new State(
        'images/states/washington.png',
        new Vector2(1269, 824).scale(0.15),
        player => {
            let abilities = player.components.controller.abilities
            for (let i = 0; i < abilities.length; i++) {
                if (abilities[i].name === 'bigly punch' || abilities[i].name === 'throw orange') {
                    player.components.controller.abilities[i].cooldown /= 4
                }
            }
            player.components.controller.properties.accel *= 1.5
            setTimeout(function () {
                for (let i = 0; i < abilities.length; i++) {
                    if (abilities[i].name === 'bigly punch' || abilities[i].name === 'throw orange') {
                        player.components.controller.abilities[i].cooldown *= 4
                    }
                }
                player.components.controller.properties.accel /= 1.5
            }, 8000)
        }
    ),
    new State(
        'images/states/florida.png',
        new Vector2(769, 779).scale(0.2),
        player => {
            player.components.approval.approval += Math.random() * 0.7 - 0.2
        }
    )
]

function bigly_punch(player) {
    bigly.play()
    let scale = Math.min(player.components.approval.approval * 0.6, 1)
    let attack = new Attack(
        player,
        constant_offset(player, new Vector2(0.6 + Math.log2(1 + scale), 0)),
        [
            new Effect(
                [damage(-30), knockback_angled(12.5, 50), change_approval(0.05)], 
                and_filters([filter_has_health(), filter_by_hit])
            )
        ]
    )
    let image = new ImageComponent(
        bigly_fist_img,
        new Vector2(0, 0),
        !player.components.controller.flip
    )
    
    let bigly_fist = attatched_hitbox(attack, image, 15, 0.2 + Math.log2(1 + scale))
    all_objects.push(bigly_fist)
}

function throw_orange(player) {
    for (let i = 0; i < 6; i++) {
        setTimeout(function() {
            orange_throw.play()
            let position = new Vector2(player.position.x, player.position.y - player.physical_properties.dimensions.y)
            let velocity = player.physical_properties.velocity.add(new Vector2(player.components.controller.flip ? 8 : -8, 0))
            all_objects.push(orange_drop(player, position, velocity, -5, 200, 0.9))
        }, i * 100)
    }
}

class NoiseOnCollision {
    constructor(noise) {
        this.noise = noise
    }

    collision(obj, coll) {
        this.noise.play()
    }
}

class DeleteOnCollision {
    constructor(allowed_tags) {
        this.delete = false
        this.allowed_tags = allowed_tags
    }

    should_delete() {
        return this.delete
    }

    collision(obj, coll) {
        for (let i = 0; i < this.allowed_tags.length; i++) {
            if (obj.tags.includes(this.allowed_tags[i])) {
                return
            }
        }
        this.delete = true
    }
}

function orange_drop(player, position, velocity, dmg, time_alive, elasticity) {
    let attack = new Attack(
        player,
        undefined,
        [new Effect([damage(dmg), delete_self(), change_approval(0.025)], filter_has_health())]
    )

    let circle = new CircleComponent(
        new Vector2(0, 0),
        'orange',
        'black',
        2
    )

    let physics = new PhysicalProperties(
        velocity, 
        50,
        0.25,
        new Vector2(50, 50),
        elasticity,
        false
    )

    let orange = projectile(position, attack, circle, physics, time_alive)
    orange.add_component('noise_on_collision', new NoiseOnCollision(orange_splat))
    orange.tags.push('orange')
    return orange
}

function build_wall(player) {
    let wall_posn = new Vector2(0, 50)
    let rect = new RectComponent(
        new Vector2(0, 0),
        'orange'
    )
    let timed_delete = new TimedDelete(450)

    let wall_physics = new PhysicalProperties(new Vector2(0, 0), 1000000, 0.1, new Vector2(200, 400), 0, false)
    let wall = new GameObject(
        player.position.add(wall_posn),
        wall_physics,
        ['wall', 'ground'],
        {
            delete : timed_delete,
            draw : rect,
            reflect : new Reflect(player)
        }
    )
    player.components.approval.approval += 0.1
    all_objects.push(wall)
}

function red_state(player) {
    let state = states[Math.floor(Math.random() * states.length)]
    yesyesyes_i_win.play()
    state.ability(player)
    all_objects.push(spawn_state(state, player.position.add(new Vector2(0, -state.scale.y))))
}

function spawn_state(state, position) {
    let physics = new PhysicalProperties(
        new Vector2(0, -2), 
        30,
        0.0,
        state.scale,
        0, 
        true
    )

    return new GameObject(
        position,
        physics,
        ['state'],
        {
            draw : new ImageComponent(state.image, new Vector2(0, 0), false),
            del : new TimedDelete(60)
        }
    )
}

function create_trump(gamepad, position, ability_draw_location, skin_name) {
    let abilities = [
        new Ability(bigly_punch, "bigly punch", 150, true, 3, 30),
        new Ability(throw_orange, "throw orange", 300, true),
        new Ability(build_wall, "build the wall", 750, true),
        new Ability(red_state, "red state", 950)
    ]
    
    let trump_stats = new PlayerStatsComponent(244)

    let trump_controller_properties = new PlayerControllerProperties(-30, 70, 17, 2)
    let trump_controller = new PlayerControllerComponent(trump_skins[skin_name], ability_draw_location, gamepad, abilities, trump_controller_properties)

    let trump_physical_properties = new PhysicalProperties(new Vector2(0, 0), 244, 0.45, new Vector2(100, 100), 0, false)
    let trump_gameobject = new GameObject(
        position,
        trump_physical_properties,
        ['trump', 'player', 'grabbable'],
        {
            controller : trump_controller, 
            stats : trump_stats,
            approval : new ApprovalComponent(0.35, -0.0015, 0.7)
        })
    return trump_gameobject
}