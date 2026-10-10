import { describe, expect, it } from 'vitest';
import {
  cnpjValido, extremidadesLT, extrairTensoesKv, normalizarData, normalizarNumero, normalizarValorMonetario,
  similaridadeNomes, somarMeses, diferencaDias,
} from '../src/index.js';

describe('normalização', () => {
  it('extrai tensões de textos variados', () => {
    expect(extrairTensoesKv('LT 500 kV Xingu – Serra Pelada C1')).toEqual([500]);
    expect(extrairTensoesKv('SE 230/138 kV e LT 138kV')).toEqual([230, 138]);
    expect(extrairTensoesKv('Bipolo ±800 kV')).toEqual([800]);
    expect(extrairTensoesKv('sem tensão')).toEqual([]);
  });

  it('normaliza números e valores monetários em formato brasileiro', () => {
    expect(normalizarNumero('1.234,56')).toBe(1234.56);
    expect(normalizarNumero('1234.56')).toBe(1234.56);
    expect(normalizarNumero('1.234')).toBe(1234);
    expect(normalizarValorMonetario('R$ 1,2 bilhão')).toBe(1.2e9);
    expect(normalizarValorMonetario('R$ 350 milhões')).toBe(350e6);
    expect(normalizarValorMonetario('R$ 12.500.000,00')).toBe(12_500_000);
  });

  it('normaliza datas em formatos de documentos', () => {
    expect(normalizarData('15/03/2026')).toEqual({ data: '2026-03-15', precisao: 'dia' });
    expect(normalizarData('2026-03-15')).toEqual({ data: '2026-03-15', precisao: 'dia' });
    expect(normalizarData('março de 2027')).toEqual({ data: '2027-03-01', precisao: 'mes' });
    expect(normalizarData('mar/2027')).toEqual({ data: '2027-03-01', precisao: 'mes' });
    expect(normalizarData('2T2027')).toEqual({ data: '2027-04-01', precisao: 'mes' });
    expect(normalizarData(46096)).toEqual({ data: '2026-03-15', precisao: 'dia' });
    expect(normalizarData('31/02/2026')).toBeUndefined();
  });

  it('compara nomes de LT independentemente da ordem das extremidades', () => {
    expect(extremidadesLT('LT 500 kV Serra Pelada – Xingu C2')).toEqual(['serra pelada', 'xingu']);
    expect(similaridadeNomes('LT 500 kV Xingu – Serra Pelada C1', 'Linha de Transmissão Serra Pelada - Xingu')).toBeGreaterThan(0.85);
    expect(similaridadeNomes('LT 500 kV Xingu – Serra Pelada', 'SE Campina Grande III')).toBeLessThan(0.4);
  });

  it('valida CNPJ', () => {
    expect(cnpjValido('11.222.333/0001-81')).toBe(true);
    expect(cnpjValido('11.222.333/0001-82')).toBe(false);
  });

  it('opera datas ISO sem fuso', () => {
    expect(somarMeses('2025-01-31', 1)).toBe('2025-02-28');
    expect(somarMeses('2025-03-15', -27)).toBe('2022-12-15');
    expect(diferencaDias('2025-01-01', '2025-03-01')).toBe(59);
  });
});
