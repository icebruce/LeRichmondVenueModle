import venueJson from "../../data/venue_geometry.json";
import tables from "../../data/library/tables.json";
import chairs from "../../data/library/chairs.json";
import linens from "../../data/library/linens.json";
import eventPieces from "../../data/library/event-pieces.json";
import candles from "../../data/library/candles.json";
import florals from "../../data/library/florals.json";
import tableware from "../../data/library/tableware.json";
import { buildCatalog } from "../../src/domain/library/catalog";
import { buildVenue, parseVenue } from "../../src/domain/venue/model";

export const libraryFiles = [tables, chairs, linens, eventPieces, candles, florals, tableware];
export const catalog = buildCatalog(libraryFiles);
export const venue = buildVenue(parseVenue(venueJson));
