// Empêche l'ouverture d'une fenêtre noire (console) derrière le logiciel sous Windows
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    yds_immo_lib::run();
}
