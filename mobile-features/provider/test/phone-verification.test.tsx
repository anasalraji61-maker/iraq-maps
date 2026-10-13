import { testIDs } from '@iraq-maps/contracts';
import { t } from '@iraq-maps/i18n';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import { PhoneVerificationScreen } from '../src';
import { reply, setup } from './render';

const phone = '+9647701234567';
const verificationId = 'ver-abc-123';

jest.mocked(useLocalSearchParams).mockReturnValue({ phone, verificationId });

describe('PhoneVerificationScreen', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders the OTP input and submit button', async () => {
    const { view } = await setup(<PhoneVerificationScreen />);
    expect(view.getByTestId(testIDs.provider.otpInput)).toBeTruthy();
    expect(view.getByTestId(testIDs.provider.otpSubmit)).toBeTruthy();
  });

  it('keeps the code field left-to-right and submit is disabled until 6 digits are entered', async () => {
    const { view } = await setup(<PhoneVerificationScreen />);
    expect(view.getByTestId(testIDs.provider.otpInput)).toHaveStyle({ direction: 'ltr' });
    expect(view.getByTestId(testIDs.provider.otpSubmit)).toBeDisabled();
    await fireEvent.changeText(view.getByTestId(testIDs.provider.otpInput), '12345');
    expect(view.getByTestId(testIDs.provider.otpSubmit)).toBeDisabled();
    await fireEvent.changeText(view.getByTestId(testIDs.provider.otpInput), '123456');
    expect(view.getByTestId(testIDs.provider.otpSubmit)).toBeEnabled();
  });

  it('counts down 60s then enables the resend button', async () => {
    jest.useFakeTimers();
    const { view } = await setup(<PhoneVerificationScreen />);
    const resendLabel = () => t('provider:otp.resend');
    const resendInLabel = (time: string) => t('provider:otp.resendIn', { time });

    // Initially showing countdown.
    expect(view.getByText(resendInLabel('١:٠٠'))).toBeTruthy();

    await act(async () => void jest.advanceTimersByTime(59_000));
    expect(view.getByText(resendInLabel('٠:٠١'))).toBeTruthy();

    await act(async () => void jest.advanceTimersByTime(1_000));
    expect(view.getByText(resendLabel())).toBeTruthy();
  });

  it('calls phoneConfirm and navigates to dashboard on success', async () => {
    const providerMe = { id: 'p-1', status: 'pending', name: 'مطعم', category: 'food', location: null, phone: { number: phone, verified: true }, claimedPlaceId: null, hoursRaw: null, prices: [], links: [], photos: [], consents: [] };
    const { api, router, view } = await setup(<PhoneVerificationScreen />);
    api.providers.phoneConfirm.mockReturnValueOnce(reply(200, providerMe));
    await fireEvent.changeText(view.getByTestId(testIDs.provider.otpInput), '123456');
    await fireEvent.press(view.getByTestId(testIDs.provider.otpSubmit));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/provider/dashboard'));
    expect(api.providers.phoneConfirm).toHaveBeenCalledWith({ body: { verificationId, code: '123456' } });
  });
});
