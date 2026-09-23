import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { legacyPickingHandler } from "../_shared/legacy-picking.ts";

serve(legacyPickingHandler("next"));
