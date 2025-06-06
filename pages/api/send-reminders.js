import dbConnect from "../../lib/mongodb";
import Booking from "../../models/Booking";
import User from "../../models/User";
import Doctor from "../../models/Doctors";
import NotifiedPatient from "../../models/NotifiedPatient";
import { sendSms } from "../../utils/sendSms";
import moment from "moment";

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  console.log("SENDING REMINDERS");

  await dbConnect();
  console.log("Connecting to the Database");

  try {
    // Get tomorrow's date as a string in the same format as your bookings
    const tomorrowStr = moment()
      .add(1, 'days')
      .format('YYYY-MM-DD'); // Adjust format to match your string dates

    // Query for bookings with date string equal to tomorrowStr
    const bookings = await Booking.find({
      date: tomorrowStr, 
    }).populate("doctor");

    if (bookings.length === 0) {
      return res.status(200).json({ message: "No appointments for tomorrow." });
    }

    const notifiedPatients = [];

    for (const booking of bookings) {
      console.log("Processing booking ID:", booking._id);

      const { userId, doctor, description, date } = booking;
      const user = await User.findById(userId);

      if (!user || !user.phoneNumber) {
        console.warn(`No phone number found for user ID: ${userId}`);
        continue;
      }

      const phoneNumber = user.phoneNumber.startsWith("+")
      ? user.phoneNumber
      : `+${user.phoneNumber}`;

    const message = `Reminder: Your appointment with Dr. ${doctor.name} is scheduled for ${moment(
      date
    ).format("MMMM Do YYYY")}. Details: ${description || "No description provided."}`;

    console.log(`Sending reminder to: ${phoneNumber}`);

    try {
      await sendSms(phoneNumber, message);

      // Log the notified patient in the database
      const notifiedPatient = await NotifiedPatient.create({
        userId,
        name: user.name,
        phoneNumber,
        doctorName: doctor.name,
        appointmentDate: new Date(date),
        description: description || "No description provided"
      });
      
      notifiedPatients.push(notifiedPatient);
    } catch (smsError) {
      console.error(`Failed to send SMS to ${phoneNumber}:`, smsError);
      // Continue with other bookings even if one SMS fails
    }
  }

  return res.status(200).json({ 
    message: `Successfully sent ${notifiedPatients.length} reminders.`,
    notifiedPatients 
  });
} catch (error) {
  console.error("Error sending reminders:", error);
  return res.status(500).json({ 
    message: "Failed to send reminders", 
    error: error.message 
  });
}
}