import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ExternalApiService {
  private readonly logger = new Logger(ExternalApiService.name);
  private readonly baseUrl = 'https://worldcup26.ir';
  private cachedToken: string | null = null;

  constructor(private configService: ConfigService) {}

  // Authenticate and get JWT token from external API
  private async getAuthToken(): Promise<string> {
    if (this.cachedToken) {
      return this.cachedToken as string;
    }

    const email = this.configService.get<string>('EXTERNAL_API_EMAIL') || 'jcecc311298@gmail.com';
    const password = this.configService.get<string>('EXTERNAL_API_PASSWORD') || 'Jocaga98$$';

    this.logger.log(`Autenticando con el API externa en ${this.baseUrl}...`);

    try {
      const response = await fetch(`${this.baseUrl}/auth/authenticate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        throw new HttpException(
          'Error de autenticación con el API externa de la Copa del Mundo',
          HttpStatus.BAD_GATEWAY,
        );
      }

      const data = await response.json();
      if (!data.token) {
        throw new HttpException(
          'El API externa no retornó un token de autenticación',
          HttpStatus.BAD_GATEWAY,
        );
      }

      this.cachedToken = data.token;
      this.logger.log('Autenticación con API externa exitosa y token almacenado en caché.');
      return this.cachedToken as string;
    } catch (error: any) {
      this.logger.error('Error al conectar con el API externa para autenticación:', error.message);
      throw new HttpException(
        `Error de conexión con API externa: ${error.message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  // Clear cached token if we get a 401 Unauthorized from the external API
  private clearTokenCache() {
    this.cachedToken = null;
  }

  // Fetch all matches from external API
  async fetchGames(): Promise<any[]> {
    let token = await this.getAuthToken();
    this.logger.log('Obteniendo partidos del API externa...');

    try {
      let response = await fetch(`${this.baseUrl}/get/games`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      // If token expired, clear cache and retry once
      if (response.status === 401) {
        this.logger.warn('Token de API externa expirado. Re-autenticando...');
        this.clearTokenCache();
        token = await this.getAuthToken();
        response = await fetch(`${this.baseUrl}/get/games`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
      }

      if (!response.ok) {
        throw new HttpException(
          `Error al obtener partidos del API externa. Status: ${response.status}`,
          HttpStatus.BAD_GATEWAY,
        );
      }

      const data = await response.json();
      return data.games || [];
    } catch (error: any) {
      this.logger.error('Error al obtener partidos del API externa:', error.message);
      throw new HttpException(
        `Error al obtener partidos de API externa: ${error.message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  // Fetch a single game score from external API
  async fetchGameScore(gameId: string): Promise<any> {
    let token = await this.getAuthToken();
    this.logger.log(`Obteniendo marcador para el partido ${gameId} del API externa...`);

    try {
      let response = await fetch(`${this.baseUrl}/get/game/${gameId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.status === 401) {
        this.logger.warn('Token de API externa expirado. Re-autenticando...');
        this.clearTokenCache();
        token = await this.getAuthToken();
        response = await fetch(`${this.baseUrl}/get/game/${gameId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
      }

      if (!response.ok) {
        throw new HttpException(
          `Error al obtener marcador de partido del API externa. Status: ${response.status}`,
          HttpStatus.BAD_GATEWAY,
        );
      }

      const data = await response.json();
      return data.game;
    } catch (error: any) {
      this.logger.error(`Error al obtener marcador de partido ${gameId} de API externa:`, error.message);
      throw new HttpException(
        `Error al obtener marcador de API externa: ${error.message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  // Map English country names to their flag emoji
  getCountryFlag(countryName: string): string {
    const flagMap: Record<string, string> = {
      // 🌍 CONCACAF (6 equipos)
    'canada': '🇨🇦',
    'mexico': '🇲🇽',
    'usa': '🇺🇸',
    'united states': '🇺🇸',
    'united states of america': '🇺🇸',
    'curacao': '🇨🇼',
    'curaçao': '🇨🇼',
    'haiti': '🇭🇹',
    'panama': '🇵🇦',

    // 🌍 CONMEBOL (6 equipos)
    'argentina': '🇦🇷',
    'brazil': '🇧🇷',
    'colombia': '🇨🇴',
    'ecuador': '🇪🇨',
    'paraguay': '🇵🇾',
    'uruguay': '🇺🇾',

    // 🌍 UEFA (16 equipos)
    'austria': '🇦🇹',
    'belgium': '🇧🇪',
    'bosnia and herzegovina': '🇧🇦',
    'croatia': '🇭🇷',
    'czechia': '🇨🇿',
    'czech republic': '🇨🇿',
    'england': '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    'france': '🇫🇷',
    'germany': '🇩🇪',
    'netherlands': '🇳🇱',
    'norway': '🇳🇴',
    'portugal': '🇵🇹',
    'scotland': '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
    'spain': '🇪🇸',
    'sweden': '🇸🇪',
    'switzerland': '🇨🇭',
    'turkey': '🇹🇷',
    'türkiye': '🇹🇷',

    // 🌍 AFC - Asia (9 equipos)
    'australia': '🇦🇺',
    'iran': '🇮🇷',
    'ir iran': '🇮🇷',
    'iraq': '🇮🇶',
    'japan': '🇯🇵',
    'jordan': '🇯🇴',
    'qatar': '🇶🇦',
    'saudi arabia': '🇸🇦',
    'south korea': '🇰🇷',
    'korea republic': '🇰🇷',
    'uzbekistan': '🇺🇿',

    // 🌍 CAF - África (10 equipos)
    'algeria': '🇩🇿',
    'cape verde': '🇨🇻',
    'cabo verde': '🇨🇻',
    'dr congo': '🇨🇩',
    'democratic republic of the congo': '🇨🇩',
    'egypt': '🇪🇬',
    'ghana': '🇬🇭',
    'ivory coast': '🇨🇮',
    "côte d'ivoire": '🇨🇮',
    'morocco': '🇲🇦',
    'senegal': '🇸🇳',
    'south africa': '🇿🇦',
    'tunisia': '🇹🇳',

    // 🌍 OFC - Oceanía (1 equipo)
    'new zealand': '🇳🇿',
    };

    const normalized = countryName.trim().toLowerCase();
    return flagMap[normalized] || '⚽';
  }
}
