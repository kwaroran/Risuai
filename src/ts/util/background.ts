import { func } from "fast-check";
import { getDatabase } from "../storage/database.svelte";

const audio = new Audio("/empty.mp3");
audio.loop = true;

export function initBackground() {
    const db = getDatabase();
    if(db.keepBackground) {
        document.addEventListener('click', function() {
            audio.play();
        }, { once: true });
        audio.addEventListener("pause", function() {
            document.addEventListener('click', function() {
                audio.play();
            }, { once: true });
        });
    }
}

export function play() {
    audio.play();
}

export function stop() {
    audio.pause();
}