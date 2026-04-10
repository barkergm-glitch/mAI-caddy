// ============================================
// mAI Caddy — Demo / Default Data
// ============================================
// Demo profiles and default values for testing and new users.
// When we add Supabase auth, this becomes the "new user" template.

import { GolferProfile, ClubInBag } from '@/lib/types';

/**
 * Demo golfer profile — used for testing before user accounts exist.
 * Update this to match the tester's actual game for realistic results.
 */
export const DEMO_PROFILE: GolferProfile = {
  name: 'Mike',
  handicap: 15,
  age: 58,
  gender: 'male',
  shotShape: 'fade',
  missTendency: 'right',
  driverDistance: 230,
  strengths: 'Solid short game, good course management',
  weaknesses: 'Inconsistent driver, tendency to overthink',
  mentalNotes: 'Plays best when relaxed and not grinding on mechanics',
  playingStyle: 'Smart, strategic player who prefers safe plays over hero shots',
  clubs: [
    { clubType: 'driver', avgDistance: 230, maxDistance: 255, confidence: 'medium', notes: 'Tends to fade, occasional slice under pressure' },
    { clubType: '3w', avgDistance: 210, maxDistance: 230, confidence: 'medium' },
    { clubType: '5w', avgDistance: 195, maxDistance: 210, confidence: 'high' },
    { clubType: '4h', avgDistance: 180, maxDistance: 195, confidence: 'high' },
    { clubType: '5i', avgDistance: 165, maxDistance: 180, confidence: 'medium' },
    { clubType: '6i', avgDistance: 155, maxDistance: 168, confidence: 'high' },
    { clubType: '7i', avgDistance: 145, maxDistance: 158, confidence: 'high' },
    { clubType: '8i', avgDistance: 135, maxDistance: 148, confidence: 'high' },
    { clubType: '9i', avgDistance: 125, maxDistance: 138, confidence: 'high' },
    { clubType: 'pw', avgDistance: 115, maxDistance: 128, confidence: 'high' },
    { clubType: 'gw', avgDistance: 100, maxDistance: 115, confidence: 'high' },
    { clubType: 'sw', avgDistance: 85, maxDistance: 100, confidence: 'high' },
    { clubType: 'lw', avgDistance: 65, maxDistance: 80, confidence: 'medium' },
    { clubType: 'putter', avgDistance: 0, maxDistance: 0, confidence: 'high' },
  ] as ClubInBag[],
};

/**
 * Default club bag for new users who haven't entered their distances.
 * Based on average male golfer (15-handicap) distances.
 */
export const DEFAULT_CLUB_BAG: ClubInBag[] = [
  { clubType: 'driver', avgDistance: 215, maxDistance: 235, confidence: 'medium' },
  { clubType: '3w', avgDistance: 195, maxDistance: 215, confidence: 'medium' },
  { clubType: '5w', avgDistance: 180, maxDistance: 200, confidence: 'medium' },
  { clubType: '4h', avgDistance: 170, maxDistance: 185, confidence: 'medium' },
  { clubType: '5i', avgDistance: 155, maxDistance: 170, confidence: 'medium' },
  { clubType: '6i', avgDistance: 145, maxDistance: 160, confidence: 'medium' },
  { clubType: '7i', avgDistance: 135, maxDistance: 150, confidence: 'medium' },
  { clubType: '8i', avgDistance: 125, maxDistance: 140, confidence: 'medium' },
  { clubType: '9i', avgDistance: 115, maxDistance: 130, confidence: 'medium' },
  { clubType: 'pw', avgDistance: 105, maxDistance: 120, confidence: 'medium' },
  { clubType: 'gw', avgDistance: 90, maxDistance: 105, confidence: 'medium' },
  { clubType: 'sw', avgDistance: 80, maxDistance: 95, confidence: 'medium' },
  { clubType: 'lw', avgDistance: 60, maxDistance: 75, confidence: 'medium' },
  { clubType: 'putter', avgDistance: 0, maxDistance: 0, confidence: 'high' },
];
