using API_PQ_Quality_Tools.Mail.Services;
using API_PQ_Quality_Tools.Models;
using API_PQ_Quality_Tools.Utils;
using Microsoft.Extensions.Options;

namespace API_PQ_Quality_Tools.Mail
{
    public class MailNotificationService
    {
        private readonly string _connectionString;
        private readonly SmtpSettings _smtpSettings;
        private readonly SystemSettings _systemSettings;
        private readonly AssignedToMailService _assignedToMailService;

        public MailNotificationService(
            IConfiguration configuration,
            IOptions<SmtpSettings> smtpSettings,
            IOptions<SystemSettings> systemSettings)
        {
            _connectionString = configuration.GetConnectionString("DefaultConnection")
                ?? throw new ArgumentNullException("Connection string not found");
            _smtpSettings = smtpSettings.Value;
            _systemSettings = systemSettings.Value;

            // Initialize mail services
            _assignedToMailService = new AssignedToMailService(_connectionString, _smtpSettings, _systemSettings);
        }

        public async Task<bool> SendMailForConcernAsync(decimal concernId)
        {
            try
            {
                return await _assignedToMailService.SendMailAsync(concernId);
            }
            catch (Exception ex)
            {
                throw new Exception($"Error sending concern assignment mail: {ex.Message}", ex);
            }
        }
    }
}
