import { join } from "path";

export const DATA_DIR = process.env.DATA_DIR || "./data";
export const DB_NAME = process.env.DB_NAME || "siliconharbour.db";
export const IMAGES_DIR_NAME = process.env.IMAGES_DIR_NAME || "images";

export const DB_PATH = join(DATA_DIR, DB_NAME);
export const IMAGES_DIR = join(DATA_DIR, IMAGES_DIR_NAME);
