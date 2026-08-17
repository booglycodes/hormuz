const bigBongoNoise = new Audio('sounds/bigBongo.mp3')
const whoaaa_dudee = new Audio('sounds/whoaaaa_duuuudee.mp3')

let bong_img = new Image()
bong_img.src = "images/stoner_bong.png"

let shrooms_image = new Image() 
shrooms_image.src = 'images/shroom.png'

let stoner_skins = {
    stoner : new Skin('images/stoner.png', new Vector2(1, 1))
}

let drug_functions = {
    'weed' : player => {
        player.components.stats.input_damage_scale *= 0.75
        setTimeout(function () {
            player.components.stats.input_damage_scale /= 0.75
        }, 7500)
    },
    'coke' : player => {
        player.components.stats.output_damage_scale *= 1.25
        setTimeout(function () {
            player.components.stats.output_damage_scale /= 1.25
        }, 7500)
    },
    'speed' : player => {
        player.components.controller.properties.accel *= 1.25
        setTimeout(function () {
            player.components.controller.properties.accel /= 1.25
        }, 7500)
    },
    'booze' : player => {
        for (let i = 1000; i <= 8000; i += 1000) {
            setTimeout(function () {
                for(let i = 0; i < all_objects.length; i++) {
                    if(all_objects[i].tags.includes('player') && all_objects[i] !== player) {
                        all_objects[i].components.stats.apply_damage(-5)
                    }
                }
            }, i)
        }
    }
}

let drugs = ['weed', 'coke', 'speed', 'booze']

class DrugInventory {
    constructor() {
        this.inv = {
            'weed' : 0,
            'coke' : 0,
            'speed' : 0,
            'booze' : 0
        }
    }

    draw() {
        let draw_location = this.gameobject.components.controller.ability_draw_location.add(new Vector2(150, 0))
        ctx.fillStyle = 'white';
        ctx.font = "20px serif"

        for (let i = 0; i < drugs.length; i++) {
            ctx.fillText(
                drugs[i] + ': ' + this.inv[drugs[i]],
                draw_location.x,
                draw_location.y - i * 20
            )
        }
    }

    take_all_drugs(player) {
        for (let i = 0; i < drugs.length; i++) {
            let drug = drugs[i]
            for (let i = 0; i < this.inv[drug]; i++) {
                drug_functions[drug](player)
            }
        }
        this.inv = {
            'weed' : 0,
            'coke' : 0,
            'speed' : 0,
            'booze' : 0
        }
    }

    add_random_drug() {
        this.inv[drugs[Math.floor(Math.random() * drugs.length)]]++
    }
}

function bigBongo(player) {
    bigBongoNoise.play()
    player.components.controller.freeze(200)
    setTimeout(function () {
        let attack = new Attack(
            player,
            constant_offset(player, new Vector2(1.2, 0.1)),
            [
                new Effect(
                    [damage(-100), knockback_angled(100, 30), () => whoaaa_dudee.play()],
                    and_filters([filter_has_health(), filter_by_hit])
                )
            ]
        )
        let image = new ImageComponent(
            bong_img,
            new Vector2(0, 0),
            player.components.controller.flip
        )
        let bong = attatched_hitbox(attack, image, 25, 1.2)
        all_objects.push(bong)
    }, 1100)

    player.components.inventory.add_random_drug()
}

function the_high_life(player) {
    whoaaa_dudee.play()
    player.physical_properties.velocity.y = -30
    old_gravity_factor = gravity_factor
    gravity_factor = 0
    setTimeout(function () {
        gravity_factor = old_gravity_factor
    }, 3500)
    player.components.inventory.add_random_drug()
}

function free_weed_zone(player) {
    let range = 225

    let attack = new Attack(
        player,
        undefined,
        [
            new Effect(
                [damage(-0.2)],
                and_filters([filter_in_radius(range), filter_has_health()])
            ),
            new Effect([force_in_vel_dir(-0.3)], filter_in_radius(range)),
            new Effect(
                [delete_other()],
                and_filters([
                    filter_in_radius(),
                    filter_by_tag('projectile'),
                    filter_by_not_tag('pot_brownie')
                ])
            )
        ]       
    )

    let circle = new CircleComponent(
        new Vector2(0, 0),
        'rgba(0, 100, 0, 0.2)',
        'rgba(0, 100, 0, 0.5)',
        2,
        1.1
    )

    let physics = new PhysicalProperties(
        new Vector2(0, 0), 
        Infinity, 
        0,
        new Vector2(range * 2, range * 2),
        1,
        true
    )

    let free_weed_zone = new GameObject(
        player.position.scale(1),
        physics,
        ['area_of_effect', 'ground'],
        {
            delete : new TimedDelete(400),
            draw : circle,
            attack : attack
        }
    )
    all_objects.push(free_weed_zone)
    player.components.inventory.add_random_drug()
}

function pot_brownie(player) {
    let dir = (player.components.controller.flip ? 1 : -1)
    let position = player.position.add(new Vector2(player.physical_properties.dimensions.x * dir, 0))
    let velocity = new Vector2(dir * 3, -3)
    let brownie = pot_brownie_projectile(player, position, velocity)
    brownie.tags.push('pot_brownie')
    all_objects.push(brownie)
    player.components.inventory.add_random_drug()
}

function pot_brownie_projectile(player, position, velocity) {
    let attack = new Attack(
        player,
        undefined,
        [
            new Effect(
                [   
                    delete_self(),
                    (_, player) => {
                        player.physical_properties.velocity = new Vector2(0, 0)
                        player.components.controller.stun(300)
                    },
                    () => whoaaa_dudee.play()
                ],
                filter_by_tag('player')
            )
        ]
    )

    let rect = new RectComponent(
        new Vector2(0, 0),
        'brown',
    )

    let physics = new PhysicalProperties(
        velocity, 
        50,
        0.25,
        new Vector2(25, 25),
        0,
        false
    )

    let brownie = projectile(position, attack, rect, physics, undefined)
    brownie.add_component('stop_on_collision', new StopOnCollision('pot_brownie'))
    return brownie
}

function do_drugs(player) {
    let flipped = !player.components.controller.flip
    let attack = new Attack(
        player,
        (attack) => {
            let angle = (flipped ? 1 : -1) * attack.frame * 5.5 + 90
            let posn = new Vector2(
                Math.cos(degrees_to_radians(angle)),
                Math.sin(degrees_to_radians(angle))
            ).vector_scale(attack.player.physical_properties.dimensions)
            attack.gameobject.position = posn.scale(2).add(player.position)
        }, 
        [
            new Effect(
                [damage(-0.5), knockback_angled(1, 20)],
                filter_by_tag('player')
            ),
            new Effect(
                [knockback_angled(2, 45)],
                and_filters([filter_by_tag('pot_brownie')])
            )
        ]
    )
    let image = new ImageComponent(
        shrooms_image,
        new Vector2(0, 0),
        false
    )
    all_objects.push(attatched_hitbox(attack, image, 150, 1))
    player.components.inventory.take_all_drugs(player)
}

function create_stoner(gamepad, position, ability_draw_location, skin_name) {
    let abilities = [
        new Ability(do_drugs, "have some drugs man", 300),
        new Ability(bigBongo, "bigBongo", 420, true),
        new Ability(the_high_life, "the high life", 500, true),
        new Ability(free_weed_zone, "free weed zone", 690),
        new Ability(pot_brownie, "pot brownie", 550, true)
    ]
    
    let stoner_stats = new PlayerStatsComponent(420)

    let stoner_controller_properties = new PlayerControllerProperties(-12, 50, 15, 6)
    let stoner_controller = new PlayerControllerComponent(stoner_skins[skin_name], ability_draw_location, gamepad, abilities, stoner_controller_properties)

    let stoner_physical_properties = new PhysicalProperties(new Vector2(0, 0), 200, 0.3, new Vector2(75, 75), 0, false)
    let stoner_gameobject = new GameObject(
        position,
        stoner_physical_properties,
        ["stoner", "player", 'grabbable'],
        {
            controller : stoner_controller, 
            stats : stoner_stats,
            inventory : new DrugInventory()
        })
    return stoner_gameobject
}