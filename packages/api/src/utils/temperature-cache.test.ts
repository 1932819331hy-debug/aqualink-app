import * as GeoTIFF from 'geotiff';
import { getMMM, getHistoricalMonthlyMeans } from './temperature';

jest.mock('geotiff', () => ({ fromUrl: jest.fn() }));

const fromUrl = GeoTIFF.fromUrl as jest.Mock;
const root = 'https://storage.googleapis.com/reef_climatology/';
const tiff = {
  getImage: async () => ({
    getGDALNoData: () => -9999,
    getBoundingBox: () => [-180, -90, 180, 90],
    getWidth: () => 360,
    getHeight: () => 180,
    readRasters: async () => [[2895]],
  }),
};

test('retries a failed MMM download while sharing in-flight and successful downloads', async () => {
  const failure = new Error('Temporary TIFF download failure');
  let rejectDownload!: (reason: Error) => void;
  const download = new Promise((resolve, reject) => {
    rejectDownload = reject;
  });
  fromUrl.mockReturnValueOnce(download).mockResolvedValue(tiff);

  const failedRequests = Promise.allSettled([getMMM(0, 0), getMMM(1, 1)]);
  expect(fromUrl).toHaveBeenCalledTimes(1);
  expect(fromUrl).toHaveBeenCalledWith(`${root}sst_clim_mmm.tiff`, {
    forceXHR: true,
  });
  rejectDownload(failure);
  await expect(failedRequests).resolves.toEqual([
    { status: 'rejected', reason: failure },
    { status: 'rejected', reason: failure },
  ]);

  await expect(Promise.all([getMMM(0, 0), getMMM(1, 1)])).resolves.toEqual([
    28.95, 28.95,
  ]);
  await expect(getMMM(2, 2)).resolves.toBe(28.95);
  expect(fromUrl).toHaveBeenCalledTimes(2);
});

test('retries only the failed monthly TIFF and retains the successful months', async () => {
  fromUrl.mockClear();
  const failure = new Error('Temporary January download failure');
  fromUrl.mockRejectedValueOnce(failure).mockResolvedValue(tiff);

  await expect(getHistoricalMonthlyMeans(0, 0)).rejects.toBe(failure);
  expect(fromUrl).toHaveBeenCalledTimes(12);
  await expect(getHistoricalMonthlyMeans(0, 0)).resolves.toEqual([
    { month: 1, temperature: 28.95 },
    { month: 2, temperature: 28.95 },
    { month: 3, temperature: 28.95 },
    { month: 4, temperature: 28.95 },
    { month: 5, temperature: 28.95 },
    { month: 6, temperature: 28.95 },
    { month: 7, temperature: 28.95 },
    { month: 8, temperature: 28.95 },
    { month: 9, temperature: 28.95 },
    { month: 10, temperature: 28.95 },
    { month: 11, temperature: 28.95 },
    { month: 12, temperature: 28.95 },
  ]);
  expect(fromUrl).toHaveBeenCalledTimes(13);
  expect(fromUrl).toHaveBeenLastCalledWith(`${root}sst_clim_january.tiff`, {
    forceXHR: true,
  });
});
