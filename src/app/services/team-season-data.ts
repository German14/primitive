import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map, of, shareReplay, switchMap } from 'rxjs';
import { TeamSeasonStats } from '../models/models';
import { findTeam } from '../util/team-names';
import { DataStore } from './data-store';

interface StatRow {
  player: string;
  teamSlug: string | null;
  value: number | null;
}

interface StatFile {
  rows: StatRow[];
}

interface Club {
  division: string;
  slug: string;
  name: string;
}

interface ClubsFile {
  clubs: Club[];
}

interface TeamStatsRow {
  slug: string;
  stats: Record<string, number>;
}

interface TeamStatsFile {
  teams: TeamStatsRow[];
}

interface HistoricalTeam {
  name: string;
  played: number | null;
  goalsFor: number | null;
  goalsAgainst: number | null;
}

interface HistoricalFile {
  teams: HistoricalTeam[];
}

interface DivisionFiles {
  key: 'primera' | 'segunda';
  source: 'easports' | 'hypermotion';
}

const DIVISIONS: Record<string, DivisionFiles> = {
  'LaLiga': { key: 'primera', source: 'easports' },
  'Quiniela división 1': { key: 'primera', source: 'easports' },
  'Quiniela división 2': { key: 'segunda', source: 'hypermotion' }
};

const HISTORICAL_ALIASES: Record<string, string> = {
  'atletico de madrid': 'atletico',
  'deportivo alaves': 'alaves',
  'r racing club': 'racing santander',
  'rcd espanyol de barcelona': 'espanyol',
  'ad ceuta fc': 'ceuta',
  'albacete bp': 'albacete balompie',
  'cd castellon': 'castellon',
  'ce sabadell': 'sabadell',
  'granada cf': 'granada',
  'r sociedad b': 'real sociedad futbol b',
  'rcd mallorca': 'mallorca',
  'real sporting': 'sporting gijon',
  'ud almeria': 'almeria',
  'ud las palmas': 'las palmas'
};

const plainTeamName = (name: string) => name.normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/\[\d+\]/g, '').replace(/[()."'’]/g, ' ')
  .replace(/\s+/g, ' ').trim();

const historicalTeamKey = (name: string) => {
  const ignored = new Set(['a', 'ad', 'balompie', 'ca', 'cd', 'cf', 'club', 'de', 'del', 'e', 'f', 'fc', 'futbol', 'la', 'r', 'rc', 'rcd', 'real', 's', 'sd', 'u', 'ud']);
  return plainTeamName(name).split(' ')
    .filter(token => (token.length > 1 || token === 'b') && !ignored.has(token))
    .sort().join(' ');
};

const findHistoricalTeam = <T extends { name: string }>(teams: T[], clubName: string) => {
  const alias = HISTORICAL_ALIASES[plainTeamName(clubName)];
  const wanted = historicalTeamKey(alias ?? clubName);
  const exact = teams.find(team => historicalTeamKey(team.name) === wanted);
  if (exact) return exact;
  const tokens = wanted.split(' ');
  const partial = teams.filter(team => tokens.every(token => historicalTeamKey(team.name).split(' ').includes(token)));
  return partial.length === 1 ? partial[0] : undefined;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

@Injectable({ providedIn: 'root' })
export class TeamSeasonData {
  private store = inject(DataStore);
  private clubs$ = this.store.get<ClubsFile>('clubs.json').pipe(shareReplay(1));
  private files = new Map<string, Observable<StatFile | null>>();

  get(teamName: string, competition: string): Observable<TeamSeasonStats | null> {
    const division = DIVISIONS[competition];
    if (!division) return of(null);

    return this.clubs$.pipe(switchMap(clubs => {
      if (!clubs?.clubs) return of(null);
      const clubsInRequestedDivision = clubs.clubs.filter(club => club.division === division.source);
      const club = findTeam(clubsInRequestedDivision, teamName) ?? findTeam(clubs.clubs, teamName);
      if (!club) {
        console.warn('[datos] equipo no encontrado en los JSON de LaLiga:', teamName, competition);
        return of(null);
      }

      const statsDivision = club.division === 'easports' ? 'primera'
        : club.division === 'hypermotion' ? 'segunda' : null;
      if (!statsDivision) return of(null);

      return forkJoin({
        goals: this.statFile(statsDivision, 'goleadores'),
        assists: this.statFile(statsDivision, 'asistencias'),
        yellow: this.statFile(statsDivision, 'tarjetas-amarillas'),
        red: this.statFile(statsDivision, 'tarjetas-rojas'),
        teamStats: this.store.get<TeamStatsFile>(`stats/teams/${statsDivision}.json`),
        historical: this.store.get<HistoricalFile>(`stats/historical/${statsDivision}.json`)
      }).pipe(map(({ goals, assists, yellow, red, teamStats, historical }) => {
        const clubsInDivision = clubs.clubs.filter(team => team.division === club.division);
        const rowsForTeam = (file: StatFile | null) =>
          (file?.rows ?? []).filter(row => row.teamSlug === club.slug && row.value != null);
        const goalRows = rowsForTeam(goals);
        const assistRows = rowsForTeam(assists);
        const yellowRows = rowsForTeam(yellow);
        const redRows = rowsForTeam(red);
        const teamMetrics = teamStats?.teams.find(team => team.slug === club.slug)?.stats;
        if (!goalRows.length && !assistRows.length && !yellowRows.length && !redRows.length && !teamMetrics) return null;

        const max = (rows: StatRow[]) => Math.max(0, ...rows.map(row => row.value ?? 0));
        const goalsValue = goalRows.length ? max(goalRows) : null;
        const assistsValue = assistRows.length ? max(assistRows) : null;
        const yellowCards = yellowRows.length
          ? yellowRows.reduce((total, row) => total + (row.value ?? 0), 0) : null;
        const redCards = redRows.length
          ? redRows.reduce((total, row) => total + (row.value ?? 0), 0) : null;

        const goalsByClub = this.sumByClub(goals?.rows ?? []);
        const attackValues = clubsInDivision.map(team =>
          goalsByClub.get(team.slug) ?? 0
        ).filter(value => value > 0);
        const divisionAttackAverage = attackValues.length
          ? attackValues.reduce((total, value) => total + value, 0) / attackValues.length
          : 0;
        const gamesPlayed = teamMetrics?.games_played ?? null;
        const teamGoals = teamMetrics?.goals ?? null;
        const teamAssists = teamMetrics?.goal_assists ?? null;
        const teamGoalsConceded = teamMetrics?.goals_conceded ?? null;
        const teamPoints = teamMetrics?.points ?? null;
        const teamsWithMatches = (teamStats?.teams ?? []).filter(team => (team.stats.games_played ?? 0) > 0);
        const leagueGames = teamsWithMatches.reduce((total, team) => total + (team.stats.games_played ?? 0), 0);
        const leagueGoals = teamsWithMatches.reduce((total, team) => total + (team.stats.goals ?? 0), 0);
        const leagueGoalsPerTeamMatch = leagueGames ? leagueGoals / leagueGames : null;
        const teamGoalRates = (teamStats?.teams ?? []).flatMap(team => {
          const matches = team.stats.games_played;
          if (!matches) return [];
          return [(team.stats.goals ?? 0) / matches];
        });
        const teamGoalAverage = teamGoalRates.length
          ? teamGoalRates.reduce((total, value) => total + value, 0) / teamGoalRates.length : 0;
        const attackFactor = teamMetrics && gamesPlayed && teamGoalAverage > 0
          ? clamp(Math.sqrt((teamGoals ?? 0) / gamesPlayed / teamGoalAverage), 0.7, 1.3)
          : divisionAttackAverage > 0 && (goalsByClub.get(club.slug) ?? 0) > 0
          ? clamp(Math.sqrt((goalsByClub.get(club.slug) ?? 0) / divisionAttackAverage), 0.7, 1.3)
          : null;
        const teamAssistRates = (teamStats?.teams ?? []).flatMap(team => {
          const matches = team.stats.games_played;
          return matches ? [(team.stats.goal_assists ?? 0) / matches] : [];
        });
        const teamAssistAverage = teamAssistRates.length
          ? teamAssistRates.reduce((total, value) => total + value, 0) / teamAssistRates.length : 0;
        const creativeFactor = gamesPlayed && teamAssists != null && teamAssistAverage > 0
          ? clamp(Math.sqrt((teamAssists / gamesPlayed) / teamAssistAverage), 0.85, 1.15)
          : null;

        const historicRows = historical?.teams ?? [];
        const historicTeam = findHistoricalTeam(historicRows, club.name);
        const historicAttackRates = historicRows.flatMap(team =>
          team.played && team.goalsFor != null ? [team.goalsFor / team.played] : []
        );
        const historicDefenseRates = historicRows.flatMap(team =>
          team.played && team.goalsAgainst != null ? [team.goalsAgainst / team.played] : []
        );
        const historicAttackAverage = historicAttackRates.length
          ? historicAttackRates.reduce((total, value) => total + value, 0) / historicAttackRates.length : 0;
        const historicDefenseAverage = historicDefenseRates.length
          ? historicDefenseRates.reduce((total, value) => total + value, 0) / historicDefenseRates.length : 0;
        const historicalAttackFactor = historicTeam?.played && historicTeam.goalsFor != null && historicAttackAverage > 0
          ? clamp(Math.sqrt((historicTeam.goalsFor / historicTeam.played) / historicAttackAverage), 0.85, 1.15)
          : null;
        const historicalDefenseFactor = historicTeam?.played && historicTeam.goalsAgainst != null && historicDefenseAverage > 0
          ? clamp(Math.sqrt(historicDefenseAverage / (historicTeam.goalsAgainst / historicTeam.played)), 0.85, 1.15)
          : null;

        const opponentGoalsRates = (teamStats?.teams ?? []).flatMap(team => {
          const matches = team.stats.games_played;
          return matches && team.stats.goals_conceded != null ? [team.stats.goals_conceded / matches] : [];
        });
        const divisionOpponentGoalsAverage = opponentGoalsRates.length
          ? opponentGoalsRates.reduce((total, value) => total + value, 0) / opponentGoalsRates.length : 0;
        const defenseFactor = gamesPlayed && teamGoalsConceded != null && divisionOpponentGoalsAverage > 0
          ? clamp(Math.sqrt(divisionOpponentGoalsAverage / (teamGoalsConceded / gamesPlayed)), 0.7, 1.3)
          : null;

        const effectiveYellowCards = teamMetrics?.yellow_cards ?? yellowCards;
        const effectiveRedCards = teamMetrics?.total_red_cards ?? redCards;
        const yellowCardsPerMatch = gamesPlayed && effectiveYellowCards != null
          ? effectiveYellowCards / gamesPlayed : null;
        const redCardsPerMatch = gamesPlayed && effectiveRedCards != null
          ? effectiveRedCards / gamesPlayed : null;

        return {
          division: statsDivision,
          attackFactor,
          creativeFactor,
          defenseFactor,
          historicalAttackFactor,
          historicalDefenseFactor,
          goals: teamGoals ?? goalsValue,
          assists: teamAssists ?? assistsValue,
          yellowCards: effectiveYellowCards,
          redCards: effectiveRedCards,
          gamesPlayed,
          goalsConceded: teamGoalsConceded,
          goalsPerMatch: gamesPlayed && teamGoals != null ? teamGoals / gamesPlayed : null,
          assistsPerMatch: gamesPlayed && teamAssists != null ? teamAssists / gamesPlayed : null,
          goalsConcededPerMatch: gamesPlayed && teamGoalsConceded != null ? teamGoalsConceded / gamesPlayed : null,
          yellowCardsPerMatch,
          redCardsPerMatch,
          pointsPerMatch: gamesPlayed && teamPoints != null ? teamPoints / gamesPlayed : null,
          leagueGoalsPerTeamMatch,
          leaders: {
            goals: this.leaderNames(goalRows),
            assists: this.leaderNames(assistRows),
            yellowCards: this.leaderNames(yellowRows),
            redCards: this.leaderNames(redRows)
          }
        };
      }));
    }));
  }

  private statFile(division: 'primera' | 'segunda', stat: string): Observable<StatFile | null> {
    const key = `${division}:${stat}`;
    let file = this.files.get(key);
    if (!file) {
      file = this.store.get<StatFile>(`stats/${division}/${stat}.json`).pipe(shareReplay(1));
      this.files.set(key, file);
    }
    return file;
  }

  private sumByClub(rows: StatRow[]): Map<string, number> {
    const values = new Map<string, number>();
    for (const row of rows) {
      if (!row.teamSlug || row.value == null) continue;
      values.set(row.teamSlug, (values.get(row.teamSlug) ?? 0) + row.value);
    }
    return values;
  }

  private leaderNames(rows: StatRow[]): string[] {
    return [...rows]
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
      .slice(0, 3)
      .map(row => row.player);
  }
}
